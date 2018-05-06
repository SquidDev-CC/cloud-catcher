--- Cloud catcher connection script. This acts both as a way of connecting
-- to a new session and interfacing with the session once connected.

-- Cache some globals
local tonumber = tonumber

local function is_help(cmd)
  return cmd == "help" or cmd == "--help" or cmd == "-h" or cmd == "-?"
end

local cloud = _G.cloud_catcher
if cloud then
  -- If the cloud_catcher API is available, then we provide an interface for it
  -- instead of trying to nest things. That would be silly.
  local id, file, forceWrite = nil, nil, false
  local usage = ([[
cloud: <subcommand> [args]
Communicate with
Subcommands:
  edit <file> Open a file on the remote server.
  token       Display the token for this
              connection.
]]):gsub("^%s+", ""):gsub("%s+$", "")

    local subcommand, args = ..., table.pack(select(2, ...))
    if subcommand == "edit" or subcommand == "e" then
      local file = args[1]
      if is_help(file) then print(usage) return
      elseif file == nil then printError(usage) error()
      end

      local resolved = shell.resolve(file)
      if not fs.exists(resolved) then error(("%q does not exist"):format(file), 0)
      elseif fs.isDir(resolved) then error(("%q is a directory"):format(file), 0)
      end

      if fs.isReadOnly(resolved) then print(("%q is read only, will not be able to modify"):format(file)) end

      local ok, err = cloud.edit(resolved)
      if not ok then error(err, 0) end
      return
    elseif subcommand == "token" or subcommand == "-t" then print(cloud.token()) return
    elseif is_help(subcommand) then print(usage) return
    elseif subcommand == nil then printError(usage) error()
    else error(("%q is not a cloud catcher subcommand, run with --h for more info"):format(subcommand), 0)
    end

    error("unreachable")
    return
end

-- The actual cloud catcher client. Let's do some argument parsing!
local token = ...

local current_path = shell.getRunningProgram()
local current_name = fs.getName(current_path)
local usage = ([[%s: <token>]]):format(current_name)

if token == nil then printError(usage) error()
elseif is_help(token) then print(usage) return
end

if #token ~= 32 or token:find("[^%a%d]") then
  error("Invalid token (must be 32 alpha-numeric characters)", 0)
end

-- Let's try to connect to the remote server
local url = "ws://localhost:8080/host?id=" .. token
local remote, err = http.websocket(url)
if not remote then error("Cannot create connect to cloud catcher server: " .. err, 0) end

--- Here is a collection of libraries which we'll need. We require them as late
-- as possible for ... Well, no particular reason actually as they're bundled
-- anyway
local framebuffer, encode = require("framebuffer"), require("encode")

-- Create our term buffer and start using it
local current = term.current()
local buffer = framebuffer(current)

term.redirect(buffer)
term.clear()
term.setCursorPos(1, 1)

-- Instantiate our sub-program
local co = coroutine.create(shell.run)

-- We're all ready to go, so let's inject our API and shell hooks
do
  local max_packet_size = 16384
  _G.cloud_catcher = {
    token = function() return token end,
    edit = function(file, force)
      local handle, err = fs.open(file, "rb")
      if not handle then return false, ("Cannot open file (%s)"):format(err) end

      local contents = handle.readAll()
      handle.close()

      -- We currently don't compress because I'm a wuss.
      local encoded = contents
      if #file + #encoded + 5 > max_packet_size then
        return false, "This file is too large to be edited remotely"
      end

      local check = encode.fletcher_32(contents)

      local flag = 0x02
      if fs.isReadOnly(file) then flag = flag + 0x08 end

      -- Send the File contents packet with an edit flag
      remote.send(("30%02x%08x%s\0%s"):format(flag, check, file, contents))
      return true
    end
  }

  shell.setAlias("cloud", "/" .. current_path)

  local function complete_multi(text, options)
    local results = {}
    for i = 1, #options do
        local option, add_spaces = options[i][1], options[i][2]
        if #option + (add_spaces and 1 or 0) > #text and option:sub(1, #text) == text then
            local result = option:sub(#text + 1)
            if add_spaces then table.insert( results, result .. " " )
            else table.insert( results, result )
            end
        end
    end
    return results
  end

  local subcommands = { { "edit", true }, { "token", false } }
  shell.setCompletionFunction(current_path, function(shell, index, text, previous_text)
    -- Should never happen, but let's be safe
    if _G.cloud_catcher == nil then return end

    if index == 1 then
      return complete_multi(text, subcommands)
    elseif index == 2 and previous_text[2] == "edit" then
        return fs.complete(text, shell.dir(), true, false)
    end
  end)
end

local ok, res = coroutine.resume(co, "shell")

local last_change, last_timer = os.clock(), nil
while ok and coroutine.status(co) ~= "dead" do
  if last_timer == nil and buffer.is_dirty() then
    -- If the buffer is dirty and we've no redraw queued
    local now = os.clock()

    if now - last_change < 0.04 then
      -- If we last changed within the last tick then schedule a redraw to prevent
      -- multiple ticks
      last_timer = os.startTimer(0)
    else
      -- Otherwise send the redraw immediately
      buffer.clear_dirty()
      last_change = os.clock()
      remote.send("10" .. buffer.serialise())
    end
  end

  local event = table.pack(coroutine.yield())

  if event[1] == "timer" and event[2] == last_timer then
    -- If we've got a redraw queued reset the timer and send our draw
    last_timer = nil

    buffer.clear_dirty()
    last_change = os.clock()
    remote.send("10" .. buffer.serialise())
  elseif event[1] == "websocket_closed" and event[2] == url then
    ok, res = false, "Connection lost"
    remote = nil
  elseif event[1] == "websocket_message" and event[2] == url then
    local message = event[3]
    local code = tonumber(message:sub(1, 2), 16)

    if code == 0x00 or code == 0x01 then
      -- We shouldn't ever receive these packets, but let's handle them anyway
      ok, res = false, "Connection lost"
    elseif code == 0x02 then
      -- Reply to ping events
      remote.send("02")
    elseif code == 0x20 then
      -- Just forward paste events
      os.queueEvent("paste", message:sub(3))
    elseif code == 0x21 then
      -- Key events: a kind of 0 or 1 signifies a key press, 2 is a release
      local kind, code, char = message:match("^..(%x)(%x%x)(.*)$")
      if kind then
        kind, code = tonumber(kind, 16), tonumber(code, 16)
        if kind == 0 or kind == 1 then
          os.queueEvent("key", code, kind == 1)
          if char ~= "" then os.queueEvent("char", char) end
        elseif kind == 2 then os.queueEvent("key_up", code)
        end
      end
    elseif code == 0x22 then
      -- Mouse events
      local kind, code, x, y = message:match("^..(%x)(%x)(%x%x)(%x%x)$")
      if kind then
        kind, code, x, y = tonumber(kind, 16), tonumber(code, 16), tonumber(x, 16), tonumber(y, 16)
        if kind == 0 then os.queueEvent("mouse_click", code, x, y)
        elseif kind == 1 then os.queueEvent("mouse_up", code, x, y)
        elseif kind == 2 then os.queueEvent("mouse_drag", code, x, y)
        elseif kind == 3 then os.queueEvent("mouse_scroll", code - 1, x, y)
        end
      end
    elseif code == 0x30 then
      local flags, checksum, name, contents = message:match("^..(%x%x)(%x%x%x%x%x%x%x%x)([^\0]+)\0(.*)$")
      if flags then
        flags, checksum = tonumber(flags, 16), tonumber(checksum, 16)
        local ok = bit32.band(flags, 0x1) == 1
        local expected_checksum = 0
        if not ok then
          local handle = fs.open(name, "rb")
          if handle then
            local contents = handle.readAll()
            handle.close()
            expected_checksum = encode.fletcher_32(contents)
          end

          ok = expected_checksum == 0 or checksum == expected_checksum
        end

        local handle = ok and fs.open(name, "wb")
        if handle then
          handle.write(contents)
          handle.close()
          remote.send(("31%08x%s"):format(encode.fletcher_32(contents), name))
        else
          remote.send(("32%08x%s"):format(expected_checksum, name))
        end
      end
    end
  elseif res == nil or event[1] == res or event[1] == "terminate" then
    ok, res = coroutine.resume(co, table.unpack(event, 1, event.n))
  end
end

term.redirect(current)
term.clear()
term.setCursorPos(1, 1)

-- Clear our ugly completion hacks
_G.cloud_catcher = nil
shell.clearAlias("cloud")
shell.getCompletionInfo()[current_path] = nil

if remote ~= nil then remote.close() end

if current.endPrivateMode then current.endPrivateMode() end

if not ok then error(res, 0) end
