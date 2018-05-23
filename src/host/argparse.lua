--- A really basic argument parser
-- The Urn implementation was much nicer

local function errorf(msg, ...)
  error(msg:format(...), 0)
end

local function setter(arg, result, value)
  result[arg.name] = value or true
end

local parser = { __name = "ArgParser" }
parser.__index = parser

function parser:add(names, arg)
  if type(names) == "string" then names = { names } end

  arg.names = names
  for i = 1, #names do
    local name = names[i]
    if name:sub(1, 2) == "--" then self.options[name:sub(3)] = arg
    elseif name:sub(1, 1) == "-" then self.flags[name:sub(2)] = arg
    else self.arguments[#self.arguments + 1] = arg; arg.argument = true end
  end

  table.insert(self.list, #self.list, arg)

  -- Default to the setter action
  if arg.action == nil then arg.action = setter end
  -- Require if we're an argument, otherwise continue as normal
  if arg.required == nil then arg.required = names[1]:sub(1, 1) ~= "-" end
  if arg.name == nil then arg.name = names[1]:gsub("^-+", "") end
  if arg.mvar == nil then arg.mvar = arg.name:upper() end
end

function parser:parse(...)
  local args = table.pack(...)
  local i, n = 1, #args
  local arg_idx = 1

  local result = {}
  while i <= n do
    local arg = args[i]
    i = i + 1

    if arg:find("^%-%-([^=]+)=(.+)$") then
      local name, value = arg:match("^%-%-([^=]+)=(.+)$")
      local arg = self.options[name]

      -- Some sanity checking for arguments
      if not arg then errorf("Unknown argument %q", name) end
      if not arg.many and result[arg.name] ~= nil then errorf("%s has already been set", name) end
      if not arg.value then errorf("%s does not accept a value", name) end

      -- Run the setter
      arg:action(result, value)
    elseif arg:find("^%-%-(.*)$") then
      local name = arg:match("^%-%-(.*)$")
      local arg = self.options[name]

      -- Some sanity checking for arguments
      if not arg then errorf("Unknown argument %q", name) end
      if not arg.many and result[arg.name] ~= nil then errorf("%s has already been set", name) end

      -- Consume the value and run the setter
      if arg.value then
        local value = args[i]
        i = i + 1
        if not value then errorf("%s needs a value", name) end
        arg:action(result, value)
      else
        arg:action(result)
      end
    elseif arg:find("^%-(.+)$") then
      local flags = arg:match("^%-(.+)$")
      for j = 1, #flags do
        local name = flags:sub(j, j)
        local arg = self.flags[name]

        -- Some sanity checking
        if not arg then errorf("Unknown argument %q", name) end
        if not arg.many and result[arg.name] ~= nil then errorf("%s has already been set", name) end

        -- Consume the value and run the setter
        if arg.value then
          local value
          if j == #flags then
            value = args[i]
            i = i + 1
          else
            value = flags:sub(j + 1)
          end

          if not value then errorf("%s expects a value", name) end
          arg:action(result, value)
          break
        else
          arg:action(result)
        end
      end
    else
      local argument = self.arguments[arg_idx]
      if argument then
        argument:action(result, arg)
        arg_idx = arg_idx + 1
      else
        errorf("Unexpected argument %q", arg)
      end
    end
  end

  for i = 1, #self.list do
    local arg = self.list[i]
    if arg and arg.required and result[arg.name] == nil then
      errorf("%s is required (use -h to see usage)", arg.name)
    end
  end

  return result
end

local function get_usage(arg)
  local name
  if arg.argument then name = arg.mvar
  elseif arg.value then name = arg.names[1] .. "=" .. arg.mvar
  else name = arg.names[1]
  end

  if #arg.names > 1 then name = name .. "," .. table.concat(arg.names, ",", 2) end
  return name
end

local function create(prefix)
  local parser = setmetatable({
    options = {},
    flags = {},
    arguments = {},

    list = {},
  }, parser)

  parser:add({ "-h", "--help", "-?" }, {
    value = false, required = false,
    doc = "Show this help message",
    action = function()
      if prefix then print(prefix) print() end

      print("USAGE")
      local max = 0
      for i = 1, #parser.list do max = math.max(max, #get_usage(parser.list[i])) end
      local format = " %-" .. max .. "s %s"

      for i = 1, #parser.list do
        local arg = parser.list[i]
        print(format:format(get_usage(arg), arg.doc or ""))
      end

      error("", 0)
    end,
  })

  return parser
end

local function is_help(cmd)
  return cmd == "help" or cmd == "--help" or cmd == "-h" or cmd == "-?"
end

return { create = create, is_help = is_help }
