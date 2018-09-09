local tonumber = tonumber

local function skip_delim(str, pos, delim, err_if_missing)
  pos = pos + #str:match('^%s*', pos)
  if str:sub(pos, pos) ~= delim then
    if err_if_missing then error('Expected ' .. delim) end
    return pos, false
  end
  return pos + 1, true
end

-- A table of JSON->Lua escape characters
local esc_map = { b = '\b', f = '\f', n = '\n', r = '\r', t = '\t' }

local function parse_str_val(str, pos)
  local out, n = {}, 0
  if pos > #str then error("Malformed JSON (in string)") end

  while true do
    local c = str:sub(pos, pos)
    if c == '"' then return table.concat(out, "", 1, n), pos + 1 end

    n = n + 1
    if c == '\\' then
      local nextc = str:sub(pos + 1, pos + 1)
      if not nextc then error("Malformed JSON (in string)") end
      if nextc == "u" then
        local num = tonumber(str:sub(pos + 2, pos + 5), 16)
        if not num then error("Malformed JSON (in unicode string) ") end
        if num <= 255 then
          pos, out[n] = pos + 6, string.char(num)
        else
          pos, out[n] = pos + 6, "?"
        end
      else
        pos, out[n] = pos + 2, esc_map[nextc] or nextc
      end
    else
      pos, out[n] = pos + 1, c
    end
  end
end

local function parse_num_val(str, pos)
  local num_str = str:match('^-?%d+%.?%d*[eE]?[+-]?%d*', pos)
  local val = tonumber(num_str)
  if not val then error('Error parsing number at position ' .. pos .. '.') end
  return val, pos + #num_str
end

local null = {}
local literals = {['true'] = true, ['false'] = false, ['null'] = null }

-- Build a table of Lua->JSON escape characters
local escapes = {}
for i = 0, 255 do
  local c = string.char(i)
  if i >= 32 and i <= 126
  then escapes[c] = c
  else escapes[c] = ("\\u00%02x"):format(i)
  end
end
escapes["\t"], escapes["\n"], escapes["\r"], escapes["\""], escapes["\\"] = "\\t", "\\n", "\\r", "\\\"", "\\\\"

local function parse(str, pos, end_delim)
  pos = pos or 1
  if pos > #str then error('Reached unexpected end of input.') end
  local pos = pos + #str:match('^%s*', pos)
  local first = str:sub(pos, pos)
  if first == '{' then
    local obj, key, delim_found = {}, true, true
    pos = pos + 1
    while true do
      key, pos = parse(str, pos, '}')
      if key == nil then return obj, pos end
      if not delim_found then error('Comma missing between object items.') end
      pos = skip_delim(str, pos, ':', true)
      obj[key], pos = parse(str, pos)
      pos, delim_found = skip_delim(str, pos, ',')
    end
  elseif first == '[' then
    local arr, val, delim_found = {}, true, true
    pos = pos + 1
    while true do
      val, pos = parse(str, pos, ']')
      if val == nil then return arr, pos end
      if not delim_found then error('Comma missing between array items.') end
      arr[#arr + 1] = val
      pos, delim_found = skip_delim(str, pos, ',')
    end
  elseif first == '"' then
    return parse_str_val(str, pos + 1)
  elseif first == '-' or first:match('%d') then
    return parse_num_val(str, pos)
  elseif first == end_delim then
    return nil, pos + 1
  else
    for lit_str, lit_val in pairs(literals) do
      local lit_end = pos + #lit_str - 1
      if str:sub(pos, lit_end) == lit_str then return lit_val, lit_end + 1 end
    end
    local pos_info_str = 'position ' .. pos .. ': ' .. str:sub(pos, pos + 10)
    error('Invalid json syntax starting at ' .. pos_info_str)
  end
end

local format, gsub, tostring, pairs, next, type, concat
    = string.format, string.gsub, tostring, pairs, next, type, table.concat

local function stringify_impl(t, out, n)
  local ty = type(t)
  if ty == "table" then
    local first_ty = type(next(t))
    if first_ty == "nil" then
        -- Assume empty tables are arrays
        out[n], n = "{}", n + 1
        return n
    elseif first_ty == "string" then
      out[n], n = "{", n + 1
      local first = true
      for k, v in pairs(t) do
        if first then first = false else out[n], n = ",", n + 1 end
        out[n] = format("\"%s\":", k)
        n = stringify_impl(v, out, n + 1)
      end
      out[n], n = "}", n + 1
      return n
    elseif first_ty == "number" then
      out[n], n = "[", n + 1
      for i = 1, #t do
        if i > 1 then out[n], n = ",", n + 1 end
        n = stringify_impl(t[i], out, n)
      end
      out[n], n = "]", n + 1
      return n
    else
      error("Cannot serialize key " .. first_ty)
    end
  elseif ty == "string" then
    if t:match("^[ -~]*$") then
      out[n], n = gsub(format("%q", t), "\n", "n"), n + 1
    else
      out[n], n = "\"" .. gsub(t, ".", escapes) .. "\"", n + 1
    end
    return n
  elseif ty == "number" or ty == "boolean" then
    out[n],n  = tostring(t), n + 1
    return n
  else error("Cannot serialize type " .. ty)
  end
end

local function stringify(object)
  local buffer = {}
  local n = stringify_impl(object, buffer, 1)
  return concat(buffer, "", 1, n - 1)
end

local function try_parse(msg)
  local ok, res = pcall(parse, msg)
  if ok then return res else return nil, res end
end

return {
  stringify = stringify,
  try_parse = try_parse,
  parse = parse,
  null = null
}
