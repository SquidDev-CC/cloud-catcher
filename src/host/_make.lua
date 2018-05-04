#!/usr/bin/env lua
local out, err = io.open(..., "w")
if not out then error(err, 0) end

for _, dep in pairs { "framebuffer", "encode" } do
    out:write(("package.preload[%q] = function(...)\n"):format(dep))

    for line in io.lines(dep .. ".lua") do
      if line == "" then
        out:write("\n")
      else
      out:write("  " .. line .. "\n")
      end
    end

    out:write("end\n")
end


for line in io.lines("init.lua") do
  out:write(line:gsub("ws://localhost:8080", "wss://cloud-catcher.squiddev.cc") .. "\n")
end

out:close()
