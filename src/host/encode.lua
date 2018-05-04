--- LZW compression/decompression, as well as base64 encoding/decoding
-- Shamelessly taken from BBPack, by Jeffrey Alexander (aka Bomb Bloke).
-- http://www.computercraft.info/forums2/index.php?/topic/21801-

local band, brshift, blshift = bit32.band, bit32.arshift, bit32.lshift

local b64 = {}
for i = 1, 64 do
  local c = ("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"):sub(i, i)
  b64[i - 1] = c
  b64[c] = i - 1
end

local myEvent = tostring({})
local function snooze()
  os.queueEvent(myEvent)
  os.pullEvent(myEvent)
end

local function to_base64(inputlist)
  if type(inputlist) ~= "table" then error("b64: Expected table", 2) end
  if #inputlist == 0 then return "" end

  local curbit, curbyte, outputlist, len = 32, 0, {}, 1

  for i = 1, #inputlist do
    local inByte, mask = inputlist[i], 128

    for j = 1, 8 do
      if band(inByte, mask) == mask then curbyte = curbyte + curbit end
      curbit, mask = curbit / 2, mask / 2

      if curbit < 1 then
        outputlist[len] = b64[curbyte]
        curbit, curbyte, len = 32, 0, len + 1
      end
    end
  end

  if curbit > 1 then outputlist[len] = b64[curbyte] end

  if curbit == 1 then outputlist[len + 1] = "=="
  elseif curbit == 2 then outputlist[len + 1] = "="
  end

  return table.concat(outputlist)
end

local function from_base64(inData)
  if type(inData) ~= "string" then error("b64: Expected: string", 2) end

  local inlen = #inData
  while sub(inData, inlen, inlen) == "=" do inlen = inlen - 1 end
  if inlen == 0 then return {} end

  local curbyte, curbit, outputlist, len = 0, 128, {}, 1

  for i = 1, inlen do
    local mask, curchar = 32, b64[sub(inData, i, i)]

    for j = 1, 6 do
      if band(curchar, mask) == mask then curbyte = curbyte + curbit end
      curbit, mask = curbit / 2, mask / 2

      if curbit < 1 then
        outputlist[len] = curbyte
        curbit, curbyte, len = 128, 0, len + 1
      end
    end
  end

  if curbit > 1 and curbyte > 0 then outputlist[len] = curbyte end

  return outputlist
end

local function compressIterator(ClearCode, inputlist)
  local startCodeSize = 1
  while math.pow(2, startCodeSize) < ClearCode do startCodeSize = startCodeSize + 1 end

  local EOI, ClearCode = math.pow(2, startCodeSize) + 1, math.pow(2, startCodeSize)
  startCodeSize = startCodeSize + 1

  local curstart, len, curbit, curbyte, outputlist, codes, CodeSize, MaxCode, nextcode, curcode = 1, 2, 1, 0, {0}, {}, startCodeSize, math.pow(2, startCodeSize) - 1, EOI + 1

  local function packByte(num)
    local mask = 1

    for i = 1, CodeSize do
      if band(num, mask) == mask then curbyte = curbyte + curbit end
      curbit, mask = curbit * 2, mask * 2

      if curbit > 128 or (i == CodeSize and num == EOI) then
        local counter = blshift(brshift(len - 2, 8), 8) + 1
        outputlist[counter] = outputlist[counter] + 1

        if outputlist[counter] > 255 then
          outputlist[counter], outputlist[counter + 256], len = 255, 1, len + 1
        end

        outputlist[len] = curbyte
        curbit, curbyte, len = 1, 0, len + 1
      end
    end
  end

  packByte(ClearCode)

  return function(inpos)
    if not inpos then
      if curcode then packByte(curcode) end
      packByte(EOI)
      outputlist[len] = 0
      return outputlist
    end

    if not curcode then
      curcode = inputlist:byte(inpos)
      curstart = inpos
      return
    end

    local curstring = inputlist:sub(curstart, inpos)
    local thisCode = codes[curstring]

    if thisCode then
      curcode = thisCode
    else
      codes[curstring] = nextcode
      nextcode = nextcode + 1

      packByte(curcode)

      if nextcode == MaxCode + 2 then
        CodeSize = CodeSize + 1
        MaxCode = math.pow(2, CodeSize) - 1
      end

      if nextcode == 4095 then
        packByte(ClearCode)
        CodeSize, MaxCode, nextcode, codes = startCodeSize, math.pow(2, startCodeSize) - 1, EOI + 1, {}
      end

      curcode, curstart = inputlist:byte(inpos), inpos
    end
  end
end

local function compress(inputlist, valRange)
  if type(inputlist) ~= "string" then error("lzw: Expected: string", 2) end

  if not valRange then valRange = 256 end
  if type(valRange) ~= "number" or valRange < 2 or valRange > 256 then error("lzw: Value range must be a number between 2 - 256.", 2) end
  if #inputlist == 0 then return {} end

  local compressIt = compressIterator(valRange, inputlist)

  local sleepCounter = 0
  for i = 1, #inputlist do
    compressIt(i)

    sleepCounter = sleepCounter + 1
    if sleepCounter > 1e5 then
      snooze()
      sleepCounter = 0
    end
  end

  return compressIt(false)
end

local function decompressIterator(ClearCode, codelist)
  local startCodeSize = 1
  while math.pow(2, startCodeSize) < ClearCode do startCodeSize = startCodeSize + 1 end

  local EOI, ClearCode = math.pow(2, startCodeSize) + 1, math.pow(2, startCodeSize)
  startCodeSize = startCodeSize + 1

  local lastcounter, curbyte, spot, CodeSize, MaxCode, maskbit, nextcode, codes, gotbytes = codelist[1], codelist[2], 3, startCodeSize, math.pow(2, startCodeSize) - 1, 1, EOI + 1, {}, 1
  for i = 0, ClearCode - 1 do codes[i] = string.char(i) end

  return function()
    while true do
      local curcode, curbit = 0, 1

      for i = 1, CodeSize do
        if band(curbyte, maskbit) == maskbit then curcode = curcode + curbit end
        curbit, maskbit = curbit * 2, maskbit * 2

        if maskbit > 128 and not (i == CodeSize and curcode == EOI) then
          maskbit, curbyte, gotbytes = 1, codelist[spot], gotbytes + 1
          spot = spot + 1

          if gotbytes > lastcounter then
            if curbyte == 0 then break end
            lastcounter, gotbytes = curbyte, 1
            curbyte = codelist[spot]
            spot = spot + 1
          end
        end
      end

      if curcode == ClearCode then
        CodeSize, MaxCode, nextcode, codes = startCodeSize, math.pow(2, startCodeSize) - 1, EOI + 1, {}
        for i = 0, ClearCode - 1 do codes[i] = string.char(i) end
      elseif curcode ~= EOI then
        if codes[nextcode - 1] then
          codes[nextcode - 1] = codes[nextcode - 1] .. codes[curcode]:sub(1, 1)
        else
          codes[nextcode - 1] = codes[curcode]:sub(1, 1)
        end

        if nextcode < 4096 then
          codes[nextcode] = codes[curcode]
          nextcode = nextcode + 1
        end

        if nextcode - 2 == MaxCode then
          CodeSize = CodeSize + 1
          MaxCode = math.pow(2, CodeSize) - 1
        end

        return codes[curcode]
      else return end
    end
  end
end

local function decompress(codelist, valRange)
  if type(codelist) ~= "table" then error("lzw: Expected table", 2) end

  if not valRange then valRange = 256 end
  if type(valRange) ~= "number" or valRange < 2 or valRange > 256 then error("lzw: Value range must be a number between 2 - 256.", 2) end

  if #codelist == 0 then return "" end

  local outputlist, decompressIt, len = {}, decompressIterator(valRange, codelist), 1

  local sleepCounter = 0
  while true do
    local output = decompressIt()

    if output then
      outputlist[len] = output
      len = len + 1
    else break end

    sleepCounter = sleepCounter + 1
    if sleepCounter > 1e5 then
      snooze()
      sleepCounter = 0
    end
  end

  return table.concat(outputlist)
end

--- Computes the fletcher 32 checksum for this input.
--
-- We could optimise this a little bit (removing modulus, etc...)  but there's
-- a limit of how much impact any of it actually makes. Kinda pointless though
-- as this does 5Mb/s on my machine.
local function fletcher_32(str)
  local s1, s2, len, byte = 0, 0, #str, string.byte

  if #str % 2 ~= 0 then str = str .. "\0" end
  for i = 1, #str, 2 do
    local c1, c2 = byte(str, i, i + 1)
    s1 = (s1 + c1 + (c2 * 0x100)) % 0xFFFF
    s2 = (s2 + s1) % 0xFFFF
  end

  return s2 * 0x10000 + s1
end

return {
  to_base64   = to_base64,
  from_base64 = from_base64,
  compress    = compress,
  decompress  = decompress,
  fletcher_32 = fletcher_32
}
