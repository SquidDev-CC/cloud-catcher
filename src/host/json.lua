local tonumber = tonumber

local function skip_delim(str, pos, delim, err_if_missing)
  pos = pos + #str:match('^%s*', pos)
  if str:sub(pos, pos) ~= delim then
    if err_if_missing then error('Expected ' .. delim) end
    return pos, false
  end
  return pos + 1, true
end

local function parse_str_val(str, pos, val)
  val = val or ''
  if pos > #str then error("Malformed JSON (in string)") end
  local c = str:sub(pos, pos)
  if c == '"'  then return val, pos + 1 end
  if c ~= '\\' then return parse_str_val(str, pos + 1, val .. c) end
  local esc_map = {b = '\b', f = '\f', n = '\n', r = '\r', t = '\t'}
  local nextc = str:sub(pos + 1, pos + 1)
  if not nextc then error("Malformed JSON (in string)") end
  return parse_str_val(str, pos + 2, val .. (esc_map[nextc] or nextc))
end

local function parse_num_val(str, pos)
  local num_str = str:match('^-?%d+%.?%d*[eE]?[+-]?%d*', pos)
  local val = tonumber(num_str)
  if not val then error('Error parsing number at position ' .. pos .. '.') end
  return val, pos + #num_str
end

local null = {}
local literals = {['true'] = true, ['false'] = false, ['null'] = null }

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
    out[n],n  = gsub(format("%q", t), "\n", "n"), n + 1
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
