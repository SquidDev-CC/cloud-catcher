#!/usr/bin/env lua
local pack = pack or (table and table.pack)
local args = pack(...)
local out, err = io.open(args[1], "w")
if not out then error(err, 0) end

local function has_content(line)
  -- Strip blank lines and line comments
  return line:find("%S") and
        not (line:match("^%s*%-%-[^%[]") or line:match("^%s*%-%-$"))
end

for _, dep in pairs { "argparse", "framebuffer", "encode", "json" } do
    out:write(("package.preload[%q] = function(...)\n"):format(dep))

    for line in io.lines(dep .. ".lua") do
      if has_content(line) then
        out:write("  " .. line .. "\n")
      end
    end

    out:write("end\n")
end

local cloudCatcherServerURL = args[2] or "://localhost:8080" -- If this variable is not set by the arg then we assume that there is some local testing

for line in io.lines("init.lua") do
  if has_content(line) then
    out:write(line:gsub("://localhost:8080", cloudCatcherServerURL) .. "\n")
  end
end

out:close()
