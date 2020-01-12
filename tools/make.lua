#!/usr/bin/env lua
local server = os.getenv("npm_package_config_server") or "cloud-catcher.squiddev.cc"
local out, err = io.open("build/rollup/cloud.lua", "w")
if not out then error(err, 0) end

local function has_content(line)
  -- Strip blank lines and line comments
  return line:find("%S") and
        not (line:match("^%s*%-%-[^%[]") or line:match("^%s*%-%-$"))
end

local root = "src/host/"
for _, dep in pairs { "argparse", "framebuffer", "encode", "json" } do
    out:write(("package.preload[%q] = function(...)\n"):format(dep))

    for line in io.lines(root .. dep .. ".lua") do
      if has_content(line) then
        out:write("  " .. line .. "\n")
      end
    end

    out:write("end\n")
end

for line in io.lines(root .. "init.lua") do
  if has_content(line) then
    out:write(line:gsub("localhost:8080", server) .. "\n")
  end
end

out:close()
