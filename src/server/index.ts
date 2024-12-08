import * as http from "http";
import * as process from "process";
import * as url from "url";
import * as WebSocket from "ws";
import { register as metrics, Counter, Gauge, collectDefaultMetrics } from "prom-client";

import { HTTPCodes, WebsocketCodes } from "../codes.js";
import {
  Capability, MAX_PACKET_SIZE, PacketCode, allowedFrom, checkCapability,
  decodePacket, encodePacket,
} from "../network.js";
import { Token, checkToken } from "../token.js";
import { handle } from "./static.js";

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

const trySend = (socket: WebSocket, message: Buffer | string): void => {
  socket.send(message, (err?: Error) => {
    if (!err) return;
    console.error("Unexpected error when sending", err);
    socket.terminate();
  });
}

/**
 * Send a connection update packet to all clients
 */
const connectionUpdate = (connection: Connection) => {
  for (const [, client] of connection.clients) {
    const caps = new Set<Capability>();

    // Build a union of other sets
    for (const [, other] of connection.clients) {
      if (other !== client) {
        for (const cap of other.capabilities) caps.add(cap);
      }
    }

    trySend(client, encodePacket({
      packet: PacketCode.ConnectionUpdate,
      clients: connection.clients.size,
      capabilities: [...caps],
    }));
  }

  if (connection.clients.size == 0) {
    console.log(`All connections for ${connection.token} closed.`)
    connections.delete(connection.token);
  }
};

const server = http.createServer();
const connections = new Map<Token, Connection>();

let defaultHandler: (url: url.UrlWithParsedQuery, request: http.IncomingMessage, response: http.ServerResponse) => void;
if (process.env.NODE_ENV === "production") {
  defaultHandler = (_url, _request, response) => {
    response.writeHead(404, { "Content-Type": "text/html" });
    response.end("Not Found", "utf-8");
  };
} else {
  defaultHandler = handle("_site");
}

server.on("request", (request: http.IncomingMessage, response: http.ServerResponse) => {
  const requestUrl = url.parse(request.url || "", true);
  if (requestUrl.path === "/metrics") {
    metrics.metrics().then(result => {
      response.writeHead(200, { "Content-Type": metrics.contentType });
      response.end(result, "utf-8");
    }).catch(err => {
      console.error(err);
      response.writeHead(500, { "Content-Type": "text/plain" });
      response.end("Unknown error", "utf-8");
    })
  } else {
    return defaultHandler(requestUrl, request, response);
  }
});

collectDefaultMetrics({ register: metrics });
new Gauge({
  name: "cloudcatcher_connections",
  help: "Number of incoming websocket connections",
  collect: function () {
    let count = 0;
    for (const connection of connections.values()) count += connection.clients.size;
    this.set(count);
  }
});
new Gauge({
  name: "cloudcatcher_tokens",
  help: "Number of active tokens",
  collect: function () {
    this.set(connections.size);
  }
});
const totalConnections = new Counter({
  name: "cloudcatcher_opened_connections",
  help: "Total number of opened connections",
});

const wss = new WebSocket.WebSocketServer({
  server,
  verifyClient: (info, cb): void => {
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
  },
  maxPayload: MAX_PACKET_SIZE,
});

wss.on("connection", (ws: SessionWebSocket, req: http.IncomingMessage) => {
  const requestUrl = url.parse(req.url || "", true);
  if (!requestUrl || !requestUrl.query || !requestUrl.pathname) return ws.close(WebsocketCodes.UnsupportedData);

  totalConnections.inc();

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

      ws.on("message", m => {
        // Ensure this is a valid packet. In the future we can notify viewers of
        // their invalidity.
        const message = m.toString("utf-8");

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
            for (const client of connection.terminalViewers) trySend(client, message);
            break;

          case PacketCode.TerminalEvents:
            if (connection.terminalHost !== null) trySend(connection.terminalHost, message);
            break;

          case PacketCode.FileListing:
          case PacketCode.FileRequest:
          case PacketCode.FileAction:
          case PacketCode.FileConsume: {
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
                if (client !== ws) trySend(client, patched);
              }
            } else {
              const client = connection.clients.get(id);
              if (!client || !connection.fileClients.has(client) || client === ws) return;
              trySend(client, patched);
            }

            break;
          }
        }
      });

      ws.on("close", () => {
        // Unregister the various capabilities
        console.log(`Closing clientId=${ws.clientId}, token=${token}`)
        if (capabilities.has(Capability.TerminalHost)) connection.terminalHost = null;
        connection.terminalViewers.delete(ws);
        connection.fileClients.delete(ws);

        connection.clients.delete(ws.clientId);
        connectionUpdate(connection);
      });

      ws.on("error", e => {
        console.error(`Error in websocket client clientId=${ws.clientId}, token=${token}`, e);
        ws.terminate();
      });

      return;
    }
    default:
      return ws.close(WebsocketCodes.UnsupportedData);
  }
});

wss.on("error", e => {
  console.error("Error in websocket server", e);
});

setInterval(() => {
  wss.clients.forEach(ws => {
    const wsa = ws as SessionWebSocket;
    if (wsa.isAlive === false) {
      wsa.close();
      return wsa.terminate();
    }

    wsa.isAlive = false;
    trySend(wsa, encodePacket({ packet: PacketCode.ConnectionPing }));
  });
}, 15000);

if (process.env.LISTEN_PID) {
  // If passed a socket via systemd, use that.
  if (process.env.LISTEN_PID !== `${process.pid}`) {
    throw new Error(`LISTEN_PID=${process.env.LISTEN_PID}, but current pid is ${process.pid}`);
  }
  if (!process.env.LISTEN_FDS) throw new Error("LISTEN_FDS not given");

  const fds = parseInt(process.env.LISTEN_FDS);
  if (fds != fds) throw new Error(`Cannot parse LISTEN_FDS=${process.env.LISTEN_FDS}`);
  if (fds <= 0) throw new Error("No fds parsed from systemd");

  console.log(`Listening on fd=3`);
  server.listen({ fd: 3 });
} else {
  // Otherwise listen on a port
  const port = parseInt(process.env.CLOUD_CATCHER_PORT ?? "8080");
  if (port != port) throw new Error(`Cannot parse port from CLOUD_CATCHER_PORT=${process.env.CLOUD_CATCHER_PORT}`)

  console.log(`Listening on ${port}`);
  server.listen({ host: "localhost", port, });
}
