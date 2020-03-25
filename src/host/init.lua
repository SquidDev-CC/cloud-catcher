--- Cloud catcher connection script. This acts both as a way of connecting
-- to a new session and interfacing with the session once connected.

-- Cache some globals
local tonumber, type, keys = tonumber, type, keys
local argparse = require "argparse"
local framebuffer = require "framebuffer"
local encode = require "encode"
local json = require "json"

if _G.cloud_catcher then
  -- If the cloud_catcher API is available, then we provide an interface for it
  -- instead of trying to run another session.
  local usage = ([[
  cloud: <subcommand> [args]
  Communicate with the cloud-catcher session.
  Subcommands:
    edit <file> Open a file on the remote server.
    token       Display the token for this
                connection.
  ]]):gsub("^%s+", ""):gsub("%s+$", ""):gsub("\n  ", "\n")

  local subcommand = ...
  if subcommand == "edit" or subcommand == "e" then
    local arguments = argparse.create("cloud edit: Edit a file in the remote viewer")
    arguments:add({ "file" }, { doc = "The file to upload", required = true })
    local result = arguments:parse(select(2, ...))

    local file = result.file
    local resolved = shell.resolve(file)

    -- Create .lua files by default
    if not fs.exists(resolved) and not resolved:find("%.") then
      local extension = settings.get("edit.default_extension", "")
      if extension ~= "" and type(extension) == "string" then
          resolved = resolved .. "." .. extension
      end
    end

    -- Error checking: we can't edit directories or readonly files which don't exist
    if fs.isDir(resolved) then error(("%q is a directory"):format(file), 0) end
    if fs.isReadOnly(resolved) then
      if fs.exists(resolved) then
        print(("%q is read only, will not be able to modify"):format(file))
      else
        error(("%q does not exist"):format(file), 0)
      end
    end

    -- Let's actually edit the thing!
    local ok, err = _G.cloud_catcher.edit(resolved)
    if not ok then error(err, 0) end

  elseif subcommand == "token" or subcommand == "t" then
    print(_G.cloud_catcher.token())

  elseif argparse.is_help(subcommand) then
    print(usage)

  elseif subcommand == nil then
    printError(usage)
    error()

  else
    error(("%q is not a cloud catcher subcommand, run with --h for more info"):format(subcommand), 0)
  end

  return
end

-- The actual cloud catcher client. Let's do some argument parsing!
local current_path = shell.getRunningProgram()
local current_name = fs.getName(current_path)

local arguments = argparse.create(current_name .. ": Interact with this computer remotely")
arguments:add({ "token" }, { doc = "The token to use when connecting" })
arguments:add({ "--term", "-t" }, { value = true, doc = "Terminal dimensions or none to hide" })
arguments:add({ "--dir",  "-d" }, { value = true, doc = "The directory to sync to. Defaults to the current one." })
arguments:add({ "--http", "-H" }, { value = false, doc = "Use HTTP instead of HTTPs" })
local args = arguments:parse(...)

local token = args.token
if #token ~= 32 or token:find("[^%a%d]") then
  error("Invalid token (must be 32 alpha-numeric characters)", 0)
end

-- We keep track of what capabilities are enabled
local capabilities = {}

--- Terminal support
local term_opts = args.term
local previous_term, parent_term = term.current()
if term_opts == nil then
  parent_term = previous_term
else if term_opts == "none" then
  parent_term = nil
elseif term_opts == "hide" then
  parent_term = framebuffer.empty(true, term.getSize())
elseif term_opts:find("^(%d+)x(%d+)$") then
  local w, h = term_opts:match("^(%d+)x(%d+)$")
  if w == 0 or h == 0 then error("Terminal cannot have 0 size", 0) end
  parent_term = framebuffer.empty(true, tonumber(w), tonumber(h))
else
    error("Unknown format for term: expected \"none\", \"hide\" or \"wxh\"", 0)
  end
end

if parent_term then
  table.insert(capabilities, "terminal:host")
  local w, h = parent_term.getSize()
  if w * h > 5000 then error("Terminal is too large to handle", 0) end
end

-- Handle file system syncing
local sync_dir = shell.resolve(args.dir or "./")
if not fs.isDir(sync_dir) then error(("%q is not a directory"):format(sync_dir), 0) end
table.insert(capabilities, "file:host")

-- Let's try to connect to the remote server
local url = ("%s://localhost:8080/connect?id=%s&capabilities=%s"):format(
  args.http and "ws" or "wss", token, table.concat(capabilities, ","))
local remote, err = http.websocket(url)
if not remote then error("Cannot connect to cloud-catcher server: " .. err, 0) end

-- Keep track of what capabilities the remote server has. We do this up here
-- so the API has information about it.
local server_term, server_file_edit, server_file_host = false, false, false

-- We're all ready to go, so let's inject our API and shell hooks
do
  local max_packet_size = 16384
  _G.cloud_catcher = {
    token = function() return token end,
    edit = function(file, force)
      -- Check the remote client exists
      if not server_file_edit then
        return false, "There are no editors connected"
      end

      -- We default to editing an empty string if the file doesn't exist
      local contents, exists
      local handle = fs.open(file, "rb")
      if handle then
        contents = handle.readAll()
        handle.close()
        exists = true
      else
        contents = ""
        exists = false
      end

      -- We currently don't compress because I'm a wuss.
      if #file + #contents + 5 > max_packet_size then
        return false, "This file is too large to be edited remotely"
      end

      local check = encode.fletcher_32(contents)

      local flag = 0x04
      if fs.isReadOnly(file) then flag = flag + 0x01 end
      if not exists then flag = flag + 0x08 end

      remote.send(json.stringify {
        packet = 0x22,
        id = 0,
        actions = {
          { file = file, checksum = check, flags = flag, action = 0, contents = contents }
        }
      })
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
-- Create our term buffer and program and start using it
local co, buffer
if parent_term ~= nil then
  buffer = framebuffer.buffer(parent_term)
  co = coroutine.create(shell.run)
  term.redirect(buffer)
end

-- Oh here we are and here we are and here we go.
-- I'm sorry all for the messy, bad code
-- Here we gooooooooooooh,
-- Rockin' all over the world

local info_dirty, last_label, get_label = true, nil, os.getComputerLabel
local function send_info()
  last_label = get_label()
  info_dirty = false
  remote.send(json.stringify {
    packet = 0x12,
    id = os.getComputerID(),
    label = last_label,
  })
end

local ok, res = true
if co then ok, res = coroutine.resume(co, "shell") end
local last_change, last_timer = os.clock(), nil
local pending_events, pending_n = {}, 0
while ok and (not co or coroutine.status(co) ~= "dead") do
  if not info_dirty and last_label ~= get_label() then info_dirty = true end
  if server_term and last_timer == nil and (buffer.is_dirty() or info_dirty) then
    -- If the buffer is dirty and we've no redraw queued and somebody
    -- cares about us.
    local now = os.clock()

    if now - last_change < 0.04 then
      -- If we last changed within the last tick then schedule a send to prevent
      -- doing so multiple times in a tick
      last_timer = os.startTimer(0)
    else
      -- Otherwise send the changes immediately
      last_change = os.clock()

      if buffer.is_dirty() then
        remote.send(buffer.serialise())
        buffer.clear_dirty()
      end

      if info_dirty then send_info() end
    end
  end

  -- We maintain a buffer of "fake" events in order to allow us to operate
  -- within multishell
  local event
  if pending_n >= 1 then
    event = table.remove(pending_events, 1)
    pending_n = pending_n - 1
  else
    event = table.pack(coroutine.yield())
  end

  if event[1] == "timer" and event[2] == last_timer then
    -- If we've got a redraw queued then reset the timer and (if needed) push
    -- send it to any viewers.
    last_timer = nil
    if server_term then
      last_change = os.clock()
      if buffer.is_dirty() then remote.send(buffer.serialise()) buffer.clear_dirty() end
      if info_dirty then send_info() end
    end

  elseif event[1] == "websocket_closed" and event[2] == url then
    ok, res = false, "Connection lost"
    remote = nil

  elseif event[1] == "websocket_message" and event[2] == url then
    local packet = json.try_parse(event[3])
    -- Extract the packet code so we can handle this in a more elegant way.
    local code = packet and packet.packet
    if type(code) ~= "number" then code = - 1 end

    -- General connection packets
    if code >= 0x00 and code < 0x10 then
      if code == 0x00 then -- ConnectionUpdate
        -- Reset our capabilities and then enable them again
        server_term, server_file_edit, server_file_host = false, false, false
        for _, cap in ipairs(packet.capabilities) do
          if cap == "terminal:view" and buffer ~= nil then
            -- If we have some viewer and they're listening then resend the
            -- terminal and info, just in case.
            server_term = true

            remote.send(buffer.serialise()) buffer.clear_dirty()
            send_info()

            last_change = os.clock()
          elseif cap == "file:host" then
            server_file_host = true
          elseif cap == "file:edit" then
            server_file_edit = true
          end
        end
      elseif code == 0x02 then -- ConnectionPing
        -- Reply to ping events
        remote.send([[{"packet":2}]])
      end

    -- Packets requiring the terminal:viewer capability
    elseif server_term and code >= 0x10 and code < 0x20 then
      if code == 0x11 then -- TerminalEvents
        -- Just forward events. We map key/key_up events to the correct version.
        for _, event in ipairs(packet.events) do
          pending_n = pending_n + 1
          if event.name == "cloud_catcher_key" then
            local key = keys[event.args[1]]
            if type(key) == "number" then pending_events[pending_n] = { n = 3, "key", key, event.args[2] } end
          elseif event.name == "cloud_catcher_key_up" then
              local key = keys[event.args[1]]
              if type(key) == "number" then pending_events[pending_n] = { n = 2, "key_up", key } end
          else
            pending_events[pending_n] = table.pack(event.name, table.unpack(event.args))
          end
        end
      end

    -- Packets requring the file:host/file:editor capability
    elseif code >= 0x20 and code < 0x30 then
      if code == 0x22 then -- FileAction
        local result = {}
        for i, action in pairs(packet.actions) do
          -- If the force flag is true, then we can always edit
          local ok = bit32.band(action.flags, 0x1) == 1

          -- Try to open the file. If it exists, determine the expected checksum
          local expected_checksum = 0
          local handle = fs.open(action.file, "rb")
          if handle then
            local contents = handle.readAll()
            handle.close()
            expected_checksum = encode.fletcher_32(contents)
          end

          -- We can edit the file if it doesn't already exist, or if the checksums match.
          if not ok then
            ok = expected_checksum == 0 or action.checksum == expected_checksum
          end

          if not ok then
            -- Reject due to mismatched checksum
            result[i] = { file = action.file, checksum = expected_checksum, result = 2 }

          elseif action.action == 0x0 then -- Replace
            handle = fs.open(action.file, "wb")
            -- Try to write, sending a failure if not possible.
            if handle then
              handle.write(action.contents)
              handle.close()
              result[i] = { file = action.file, checksum = encode.fletcher_32(action.contents), result = 1 }
            else
              result[i] = { file = action.file, checksum = expected_checksum, result = 3 }
            end

          elseif action.action == 0x1 then -- Patch
            handle = fs.open(action.file, "rb")
            if handle then
              local out, n = {}, 0
              for _, delta in pairs(action.delta) do
                if delta.kind == 0 then -- Same
                  n = n + 1
                  out[n] = handle.read(delta.length)
                elseif delta.kind == 1 then -- Added
                  n = n + 1
                  out[n] = delta.contents
                elseif delta.kind == 2 then -- Removed
                  handle.read(delta.length)
                end
              end
              handle.close()

              handle = fs.open(action.file, "wb")
              if handle then
                local contents = table.concat(out)
                handle.write(contents)
                handle.close()

                -- File written OK
                result[i] = { file = action.file, checksum = encode.fletcher_32(contents), result = 1 }
              else
                -- File could not be written
                result[i] = { file = action.file, checksum = expected_checksum, result = 3 }
              end
            else
              -- File does not exist, obviously patching is impossible
              result[i] = { file = action.file, checksum = expected_checksum, result = 2 }
            end


          elseif action.action == 0x02 then -- Delete
            local ok = fs.delete(action.file)
            result[i] = { file = action.file, checksum = action.checksum, result = ok and 1 or 3 }
          end
        end

        remote.send(json.stringify {
          packet = 0x23,
          id = packet.id,
          files = result,
        })
      end
    end

  elseif res == nil or event[1] == res or event[1] == "terminate" then
    -- If we're running a child program (we have a terminal) then forward our
    -- events, otherwise skip for now.
    if co then
      ok, res = coroutine.resume(co, table.unpack(event, 1, event.n))
    elseif event[1] == "terminate" then
      ok, res = false, "Terminated"
    end
  end
end

term.redirect(previous_term)
if previous_term == parent_term then
  -- If we were writing to the current terminal then reset it.
  term.clear()
  term.setCursorPos(1, 1)
  if previous_term.endPrivateMode then previous_term.endPrivateMode() end
end

-- Clear our ugly completion hacks
_G.cloud_catcher = nil
shell.clearAlias("cloud")
shell.getCompletionInfo()[current_path] = nil

if remote ~= nil then remote.close() end

if not ok then error(res, 0) end
