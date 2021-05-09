--- Just another frame buffer, but this one is serialisable!

local stringify = require("json").stringify

local colour_lookup = {}
for i = 0, 15 do
  colour_lookup[2 ^ i] = string.format("%x", i)
end

local void = function() end

--- Create an empty terminal object which will discard output
local function empty(colour, width, height)
  local function is_colour() return colour end
  return {
    -- A load of voiding setters
    write = void, blit = void, clear = void, clearLine = void,
    setCursorPos = void, setCursorBlink = void,
    setPaletteColour = void, setPaletteColor = void,
    setTextColour = void, setTextColor = void, setBackgroundColour = void, setBackgroundColor = void,
    getTextColour = void, getTextColor = void, getBackgroundColour = void, getBackgroundColor = void,
    scroll = void,

    -- The few getters we actually use
    isColour = is_colour, isColor = is_colour,
    getSize = function() return width, height end,
    getPaletteColour = term.native().getPaletteColour, getPaletteColor = term.native().getPaletteColor,
  }
end

--- Create a buffer which can be converted to a string and transmitted.
local function buffer(original)
  local text = {}
  local text_colour = {}
  local back_colour = {}
  local palette = {}
  local palette_24 = {}

  local cursor_x, cursor_y = 1, 1

  local cursor_blink = false
  local cur_text_colour = "0"
  local cur_back_colour = "f"

  local sizeX, sizeY = original.getSize()
  local color = original.isColor()

  local dirty = false

  local redirect = {}

  if original.getPaletteColour then
    for i = 0, 15 do
      local c = 2 ^ i
      palette[c] = { original.getPaletteColour( c ) }
      palette_24[colour_lookup[c]] = colours.rgb8(original.getPaletteColour( c ))
    end
  end

  function redirect.write(writeText)
    writeText = tostring(writeText)
    original.write(writeText)
    dirty = true

    -- If we're off the screen then just emulate a write
    if cursor_y > sizeY or cursor_y < 1 or cursor_x + #writeText <= 1 or cursor_x > sizeX then
      cursor_x = cursor_x + #writeText
      return
    end

    -- Adjust text to fit on screen
    if cursor_x < 1 then
      writeText = writeText:sub(-cursor_x + 2)
      cursor_x = 1
    elseif cursor_x + #writeText > sizeX then
      writeText = writeText:sub(1, sizeX - cursor_x + 1)
    end

    local lineText = text[cursor_y]
    local lineColor = text_colour[cursor_y]
    local lineBack = back_colour[cursor_y]
    local preStop = cursor_x - 1
    local preStart = math.min(1, preStop)
    local postStart = cursor_x + #writeText
    local postStop = sizeX
    local sub, rep = string.sub, string.rep

    text[cursor_y] = sub(lineText, preStart, preStop)..writeText..sub(lineText, postStart, postStop)
    text_colour[cursor_y] = sub(lineColor, preStart, preStop)..rep(cur_text_colour, #writeText)..sub(lineColor, postStart, postStop)
    back_colour[cursor_y] = sub(lineBack, preStart, preStop)..rep(cur_back_colour, #writeText)..sub(lineBack, postStart, postStop)
    cursor_x = cursor_x + #writeText
  end

  function redirect.blit(writeText, writeFore, writeBack)
    original.blit(writeText, writeFore, writeBack)
    dirty = true

    -- If we're off the screen then just emulate a write
    if cursor_y > sizeY or cursor_y < 1 or cursor_x + #writeText <= 1 or cursor_x > sizeX then
      cursor_x = cursor_x + #writeText
      return
    end

    if cursor_x < 1 then
      --adjust text to fit on screen starting at one.
      writeText = writeText:sub(-cursor_x + 2)
      writeFore = writeFore:sub(-cursor_x + 2)
      writeBack = writeBack:sub(-cursor_x + 2)
      cursor_x = 1
    elseif cursor_x + #writeText > sizeX then
      writeText = writeText:sub(1, sizeX - cursor_x + 1)
      writeFore = writeFore:sub(1, sizeX - cursor_x + 1)
      writeBack = writeBack:sub(1, sizeX - cursor_x + 1)
    end

    local lineText = text[cursor_y]
    local lineColor = text_colour[cursor_y]
    local lineBack = back_colour[cursor_y]
    local preStop = cursor_x - 1
    local preStart = math.min(1, preStop)
    local postStart = cursor_x + #writeText
    local postStop = sizeX
    local sub = string.sub

    text[cursor_y] = sub(lineText, preStart, preStop)..writeText..sub(lineText, postStart, postStop)
    text_colour[cursor_y] = sub(lineColor, preStart, preStop)..writeFore..sub(lineColor, postStart, postStop)
    back_colour[cursor_y] = sub(lineBack, preStart, preStop)..writeBack..sub(lineBack, postStart, postStop)
    cursor_x = cursor_x + #writeText
  end

  function redirect.clear()
    for i = 1, sizeY do
      text[i] = string.rep(" ", sizeX)
      text_colour[i] = string.rep(cur_text_colour, sizeX)
      back_colour[i] = string.rep(cur_back_colour, sizeX)
    end

    dirty = true
    return original.clear()
  end

  function redirect.clearLine()
    -- If we're off the screen then just emulate a clearLine
    if cursor_y > sizeY or cursor_y < 1 then
      return
    end

    text[cursor_y] = string.rep(" ", sizeX)
    text_colour[cursor_y] = string.rep(cur_text_colour, sizeX)
    back_colour[cursor_y] = string.rep(cur_back_colour, sizeX)

    dirty = true
    return original.clearLine()
  end

  function redirect.getCursorPos()
    return cursor_x, cursor_y
  end

  function redirect.setCursorPos(x, y)
    if type(x) ~= "number" then error("bad argument #1 (expected number, got " .. type(x) .. ")", 2) end
    if type(y) ~= "number" then error("bad argument #2 (expected number, got " .. type(y) .. ")", 2) end

    if x ~= cursor_x or y ~= cursor_y then
      cursor_x = math.floor(x)
      cursor_y = math.floor(y)
      dirty = true
    end

    return original.setCursorPos(x, y)
  end

  function redirect.setCursorBlink(b)
    if type(b) ~= "boolean" then error("bad argument #1 (expected boolean, got " .. type(b) .. ")", 2) end

    if cursor_blink ~= b then
      cursor_blink = b
      dirty = true
    end

    return original.setCursorBlink(b)
  end

  function redirect.getSize()
    return sizeX, sizeY
  end

  function redirect.scroll(n)
    if type(n) ~= "number" then error("bad argument #1 (expected number, got " .. type(n) .. ")", 2) end

    local empty_text = string.rep(" ", sizeX)
    local empty_text_colour = string.rep(cur_text_colour, sizeX)
    local empty_back_colour = string.rep(cur_back_colour, sizeX)
    if n > 0 then
      for i = 1, sizeY do
        text[i] = text[i + n] or empty_text
        text_colour[i] = text_colour[i + n] or empty_text_colour
        back_colour[i] = back_colour[i + n] or empty_back_colour
      end
    elseif n < 0 then
      for i = sizeY, 1, -1 do
        text[i] = text[i + n] or empty_text
        text_colour[i] = text_colour[i + n] or empty_text_colour
        back_colour[i] = back_colour[i + n] or empty_back_colour
      end
    end

    dirty = true
    return original.scroll(n)
  end

  function redirect.setTextColour(clr)
    if type(clr) ~= "number" then error("bad argument #1 (expected number, got " .. type(clr) .. ")", 2) end
    local new_colour = colour_lookup[clr] or error("Invalid colour (got " .. clr .. ")" , 2)

    if new_colour ~= cur_text_colour then
      dirty = true
      cur_text_colour = new_colour
    end

    return original.setTextColour(clr)
  end
  redirect.setTextColor = redirect.setTextColour

  function redirect.setBackgroundColour(clr)
    if type(clr) ~= "number" then error("bad argument #1 (expected number, got " .. type(clr) .. ")", 2) end
    local new_colour = colour_lookup[clr] or error("Invalid colour (got " .. clr .. ")" , 2)

    if new_colour ~= cur_back_colour then
      dirty = true
      cur_back_colour = new_colour
    end

    return original.setBackgroundColour(clr)
  end
  redirect.setBackgroundColor = redirect.setBackgroundColour

  function redirect.isColour()
    return color == true
  end
  redirect.isColor = redirect.isColour

  function redirect.getTextColour()
    return 2 ^ tonumber(cur_text_colour, 16)
  end
  redirect.getTextColor = redirect.getTextColour

  function redirect.getBackgroundColour()
    return 2 ^ tonumber(cur_back_colour, 16)
  end
  redirect.getBackgroundColor = redirect.getBackgroundColour

  if original.getPaletteColour then
    function redirect.setPaletteColour(colour, r, g, b)
      local palcol = palette[colour]
      if not palcol then error("Invalid colour (got " .. tostring(colour) .. ")", 2) end

      if type(r) == "number" and g == nil and b == nil then
          palcol[1], palcol[2], palcol[3] = colours.rgb8(r)
          palette_24[colour_lookup[colour]] = r
      else
          if type(r) ~= "number" then error("bad argument #2 (expected number, got " .. type(r) .. ")", 2) end
          if type(g) ~= "number" then error("bad argument #3 (expected number, got " .. type(g) .. ")", 2) end
          if type(b) ~= "number" then error("bad argument #4 (expected number, got " .. type(b ) .. ")", 2 ) end

          palcol[1], palcol[2], palcol[3] = r, g, b
          palette_24[colour_lookup[colour]] = colours.rgb8(r, g, b)
      end

      dirty = true
      return original.setPaletteColour(colour, r, g, b)
    end
    redirect.setPaletteColor = redirect.setPaletteColour

    function redirect.getPaletteColour(colour)
      local palcol = palette[colour]
      if not palcol then error("Invalid colour (got " .. tostring(colour) .. ")", 2) end
      return palcol[1], palcol[2], palcol[3]
    end
    redirect.getPaletteColor = redirect.getPaletteColour
  end

  function redirect.is_dirty() return dirty end
  function redirect.clear_dirty() dirty = false end

  function redirect.serialise()
    return stringify {
      packet = 0x10,

      width = sizeX, height = sizeY,
      cursorX = cursor_x, cursorY = cursor_y, cursorBlink = cursor_blink,
      curFore = cur_text_colour, curBack = cur_back_colour,

      palette = palette_24,
      text = text, fore = text_colour, back = back_colour
    }
  end

  -- Ensure we're in sync with the parent terminal
  redirect.setCursorPos(1, 1)
  redirect.setBackgroundColor(colours.black)
  redirect.setTextColor(colours.white)
  redirect.clear()

  return redirect
end

return { buffer = buffer, empty = empty }
