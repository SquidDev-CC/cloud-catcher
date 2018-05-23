--- Computes the fletcher 32 checksum for this input.
--
-- We could optimise this a little bit (removing modulus, etc...)  but there's
-- a limit of how much impact any of it actually makes. Kinda pointless though
-- as this does 5Mb/s on my machine.
local function fletcher_32(str)
  local s1, s2, byte = 0, 0, string.byte

  if #str % 2 ~= 0 then str = str .. "\0" end
  for i = 1, #str, 2 do
    local c1, c2 = byte(str, i, i + 1)
    s1 = (s1 + c1 + (c2 * 0x100)) % 0xFFFF
    s2 = (s2 + s1) % 0xFFFF
  end

  return s2 * 0x10000 + s1
end

return {
  fletcher_32 = fletcher_32
}
