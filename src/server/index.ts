import * as fs from "fs";
import * as http from "http";
import * as process from "process";
import * as url from "url";
import * as WebSocket from "ws";
import { HTTPCodes, WebsocketCodes } from "../codes";
import {
  Capability, MAX_PACKET_SIZE, PacketCode, allowedFrom, checkCapability,
  decodePacket, encodePacket,
} from "../network";
import { Token, checkToken } from "../token";
import { handle } from "./static";

type SessionWebSocket = WebSocket & {
  isAlive: boolean,
  capabilities: Set<Capability>,
  clientId: number,
};

type Connection = {
  token: Token,

  lastClient: number,
  clients: Map<number, SessionWebSocket>,

  terminalHost: SessionWebSocket | null,
  terminalViewers: Set<SessionWebSocket>,

  fileClients: Set<SessionWebSocket>,
};

const sendCallback = (err?: Error) => {
  if (err) {
    console.error("Unexpected error when sending", err);
  }
};

/**
 * Send a connection update packet to all clients
 */
const connectionUpdate = (connection: Connection) => {
  for (const [_, client] of connection.clients) {
    const caps = new Set<Capability>();

    // Build a union of other sets
    for (const [_, other] of connection.clients) {
      if (other !== client) {
        for (const cap of other.capabilities) caps.add(cap);
      }
    }

    client.send(encodePacket({
      packet: PacketCode.ConnectionUpdate,
      clients: connection.clients.size,
      capabilities: [...caps],
    }), sendCallback);
  }
};

const server = http.createServer();
const connections = new Map<Token, Connection>();

if (process.env.NODE_ENV === "production") {
  const contents404 = fs.readFileSync("public/404.html", { encoding: "utf-8" });
  server.on("request", (_request: http.IncomingMessage, response: http.ServerResponse) => {
    response.writeHead(404, { "Content-Type": "text/html" });
    response.end(contents404, "utf-8");
    return;
  });
} else {
  server.on("request", handle("dist/public"));
}

const wss = new WebSocket.Server({
  server,
  verifyClient: ((info, cb) => {
    if (!info.req.url) return cb(false, HTTPCodes.BadRequest, "Cannot determine URL");

    const requestUrl = url.parse(info.req.url, true);
    if (!requestUrl || !requestUrl.pathname) return cb(false, HTTPCodes.BadRequest, "Cannot parse URL");

    switch (requestUrl.pathname.replace(/\/+$/, "")) {
      case "/view":
      case "/host":
        return cb(false, HTTPCodes.NotFound, "No longer implemented, update your client");

      case "/connect": {

        // Verify our token
        const token = requestUrl.query.id;
        if (!checkToken(token)) return cb(false, HTTPCodes.BadRequest, "Expected session token");

        // Verify our capability set
        const capabilityStr = requestUrl.query.capabilities;
        if (!capabilityStr || typeof capabilityStr !== "string") {
          return cb(false, HTTPCodes.BadRequest, "Expected capabilities");
        }

        const capabilityList = capabilityStr.split(",") as Capability[];
        for (const cap of capabilityList) {
          if (!checkCapability(cap)) return cb(false, HTTPCodes.BadRequest, `Unknown capability ${cap}`);
        }

        const capabilities = new Set(capabilityList);

        // If this is an established connection, verify we're all set up.
        const connection = connections.get(token);
        if (connection !== undefined) {
          if (capabilities.has(Capability.TerminalHost) && connection.terminalHost !== null) {
            return cb(false, HTTPCodes.Forbidden, "Already have terminal:host");
          }
        }

        return cb(true, HTTPCodes.OK);
      }
      default:
        return cb(false, HTTPCodes.NotFound);
    }
  }) as WebSocket.VerifyClientCallbackAsync,
  maxPayload: MAX_PACKET_SIZE,
});

wss.on("connection", (ws: SessionWebSocket, req: http.IncomingMessage) => {
  const requestUrl = url.parse(req.url || "", true);
  if (!requestUrl || !requestUrl.query || !requestUrl.pathname) return ws.close(WebsocketCodes.UnsupportedData);

  switch (requestUrl.pathname.replace(/\/+$/, "")) {
    case "/view":
    case "/host":
      return ws.close(WebsocketCodes.UnsupportedData);

    case "/connect": {
      const token = requestUrl.query.id;
      if (!checkToken(token)) return ws.close(WebsocketCodes.UnsupportedData);

      if (typeof requestUrl.query.capabilities !== "string") return ws.close(WebsocketCodes.UnsupportedData);
      const capabilities = new Set(requestUrl.query.capabilities.split(",")) as Set<Capability>;

      let conn = connections.get(token);
      if (conn === undefined) {
        conn = {
          token,

          lastClient: 1,
          clients: new Map(),

          terminalHost: null,
          terminalViewers: new Set(),
          fileClients: new Set(),
        };
        connections.set(token, conn);
      } else if (capabilities.has(Capability.TerminalHost) && conn.terminalHost != null) {
        return ws.close(WebsocketCodes.PolicyViolation);
      }

      const connection = conn;

      // Register our client with the connection. We loop through until we
      // can find a free ID.
      let wrapped = false;
      while (connection.clients.has(connection.lastClient)) {
        connection.lastClient++;
        if (connection.lastClient > 255) {
          if (wrapped) return ws.close(WebsocketCodes.TryAgainLater);
          wrapped = true;
          connection.lastClient = 1;
        }
      }

      connection.clients.set(connection.lastClient, ws);

      // Set allow the session websocket properties
      ws.isAlive = true;
      ws.capabilities = capabilities;
      ws.clientId = connection.lastClient;

      // Register the various capabilities
      if (capabilities.has(Capability.TerminalHost)) connection.terminalHost = ws;
      if (capabilities.has(Capability.TerminalView)) connection.terminalViewers.add(ws);
      if (capabilities.has(Capability.FileEdit)) connection.fileClients.add(ws);
      if (capabilities.has(Capability.FileHost)) connection.fileClients.add(ws);

      // If we're not the first connection, tell everyone about the new connection
      if (connection.clients.size > 1) {
        console.log(`Connecting to ${token} (${connection.clients.size} clients connected)`);
        connectionUpdate(connection);
      }

      ws.on("pong", () => ws.isAlive = true);

      ws.on("message", message => {
        // Ensure this is a valid packet. In the future we can notify viewers of
        // their invalidity.
        if (typeof message !== "string") return;

        const packet = decodePacket(message);
        if (!packet || !allowedFrom(packet.packet, capabilities)) return;

        switch (packet.packet) {
          case PacketCode.ConnectionPing:
            ws.isAlive = true;
            break;

          // Impossible, just handling in order to have some symmetry.
          case PacketCode.ConnectionAbuse:
          case PacketCode.ConnectionUpdate:
            break;

          case PacketCode.TerminalContents:
          case PacketCode.TerminalInfo:
            for (const client of connection.terminalViewers) client.send(message, sendCallback);
            break;

          case PacketCode.TerminalEvents:
            if (connection.terminalHost !== null) connection.terminalHost.send(message, sendCallback);
            break;

          case PacketCode.FileListing:
          case PacketCode.FileRequest:
          case PacketCode.FileAction:
          case PacketCode.FileConsume:
            const id = packet.id;
            if (typeof id !== "number" || !Number.isInteger(id)) return;

            if (packet.packet === PacketCode.FileListing) {
              // File listing packets must be sent from a file host
              if (!ws.capabilities.has(Capability.FileHost)) return;
            } else {
              // All other packets can be sent from either file entry
              if (!ws.capabilities.has(Capability.FileHost) && !ws.capabilities.has(Capability.FileEdit)) {
                return;
              }
            }

            packet.id = ws.clientId;
            const patched = encodePacket(packet);

            // All packets are forwarded to file editors and hosts.

            // TODO: patch this up a little - FileRequest and FileConsume should
            // only be sent to hosts, etc...
            if (id === 0) {
              for (const client of connection.fileClients) {
                if (client !== ws) client.send(patched, sendCallback);
              }
            } else {
              const client = connection.clients.get(id);
              if (!client || !connection.fileClients.has(client) || client === ws) return;
              client.send(patched, sendCallback);
            }

            break;
        }
      });

      ws.on("close", () => {
        // Unregister the various capabilities
        if (capabilities.has(Capability.TerminalHost)) connection.terminalHost = null;
        connection.terminalViewers.delete(ws);
        connection.fileClients.delete(ws);

        connection.clients.delete(ws.clientId);
        connectionUpdate(connection);
      });

      return;
    }
    default:
      return ws.close(WebsocketCodes.UnsupportedData);
  }
});

setInterval(() => {
  wss.clients.forEach(ws => {
    const wsa = ws as SessionWebSocket;
    if (wsa.isAlive === false) {
      wsa.close();
      return wsa.terminate();
    }

    wsa.isAlive = false;
    wsa.send(encodePacket({ packet: PacketCode.ConnectionPing }), sendCallback);
  });
}, 15000);

console.log("Listening on 8080");
server.listen(8080);
