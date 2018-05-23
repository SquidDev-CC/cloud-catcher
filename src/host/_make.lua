#!/usr/bin/env lua
local out, err = io.open(..., "w")
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


for line in io.lines("init.lua") do
  if has_content(line) then
    out:write(line:gsub("://localhost:8080", "://cloud-catcher.squiddev.cc") .. "\n")
  end
end

out:close()
