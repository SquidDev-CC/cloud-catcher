import * as fs from "fs";
import * as http from "http";
import * as process from "process";
import * as url from "url";
import * as WebSocket from "ws";
import { HTTPCodes, WebsocketCodes } from "../codes";
import { MAX_PACKET_SIZE, PacketCode, encodePacket, fromHost, fromViewer } from "../network";
import { Token, checkToken } from "../token";
import { handle } from "./static";

type SessionWebSocket = WebSocket & {
  isAlive: boolean,
  isClient: boolean,
};

type Connection = {
  token: Token,
  viewers: Set<SessionWebSocket>,
  host: SessionWebSocket | null,
  lastTerminal: string | null,
};

const server = http.createServer();
const connections = new Map<Token, Connection>();

if (process.env.NODE_ENV === "production") {
  const contents404 = fs.readFileSync("public/404.html", { encoding: "utf-8" });
  server.on("request", (_request: http.ServerRequest, response: http.ServerResponse) => {
    response.writeHead(404, { "Content-Type": "text/html" });
    response.end(contents404, "utf-8");
    return;
  });
} else {
  server.on("request", handle("public/"));
}

const wss = new WebSocket.Server({
  server,
  verifyClient: ((info, cb) => {
    if (!info.req.url) return cb(false, HTTPCodes.BadRequest, "Cannot determine URL");

    const requestUrl = url.parse(info.req.url, true);
    if (!requestUrl || !requestUrl.pathname) return cb(false, HTTPCodes.BadRequest, "Cannot parse URL");

    switch (requestUrl.pathname.replace(/\/+$/, "")) {
      case "/view": {
        if (!checkToken(requestUrl.query.id)) return cb(false, HTTPCodes.BadRequest, "Expected session token");

        return cb(true, 200);
      }
      case "/host": {
        const token = requestUrl.query.id;
        if (!checkToken(token)) return cb(false, HTTPCodes.BadRequest, "Expected session token");

        const connection = connections.get(token);
        if (connection === undefined) return cb(false, HTTPCodes.NotFound);
        if (connection.host !== null) return cb(false, HTTPCodes.Forbidden, "Already broadcasting");
        return cb(true, HTTPCodes.OK);
      }
      default:
        return cb(false, HTTPCodes.Forbidden);
    }
  }) as WebSocket.VerifyClientCallbackAsync,
  maxPayload: MAX_PACKET_SIZE,
});

wss.on("connection", (ws: SessionWebSocket, req: http.IncomingMessage) => {
  const requestUrl = url.parse(req.url || "", true);
  if (!requestUrl || !requestUrl.query || !requestUrl.pathname) return ws.close(WebsocketCodes.UnsupportedData);

  switch (requestUrl.pathname.replace(/\/+$/, "")) {
    case "/view": {
      const token = requestUrl.query.id;
      if (!checkToken(token)) return ws.close(WebsocketCodes.UnsupportedData);

      let conn = connections.get(token);
      if (conn === undefined) {
        conn = {
          token,
          viewers: new Set(),
          host: null,
          lastTerminal: null,
        };
        connections.set(token, conn);
      }

      const connection = conn;
      connection.viewers.add(ws);

      if (conn.host && conn.lastTerminal) ws.send(conn.lastTerminal);

      ws.isAlive = true;
      ws.on("pong", () => ws.isAlive = true);

      console.log(`Connecting viewer to ${token} (${connection.viewers.size} viewers connected)`);
      ws.on("message", message => {
        // Ensure this is a valid packet. In the future we can notify viewers
        // of their abuse.
        if (typeof message !== "string") return;
        const code = parseInt(message.substr(0, 2), 16);
        if (!fromViewer(code)) return;

        if (code === PacketCode.ConnectionPing) {
          ws.isAlive = true;
          return;
        }

        const host = connection.host;
        if (host !== null) host.send(message);
      });

      ws.on("close", () => {
        connection.viewers.delete(ws);
        if (connection.viewers.size <= 0) {
          if (connection.host != null) connection.host.close(WebsocketCodes.Normal);
          connections.delete(token);
        }
      });

      return;
    }
    case "/host": {
      const token = requestUrl.query.id;
      if (!checkToken(token)) return ws.close(WebsocketCodes.UnsupportedData);

      const connection = connections.get(token);
      if (connection === undefined) return ws.close(WebsocketCodes.PolicyViolation);
      if (connection.host !== null) return ws.close(WebsocketCodes.PolicyViolation);
      connection.host = ws;

      ws.isAlive = true;
      ws.on("pong", () => ws.isAlive = true);

      console.log(`Connecting computer to ${token}`);
      ws.on("message", message => {
        // Ensure this is a valid packet. In the future we can notify viewers
        // of their abuse.
        if (typeof message !== "string") return;
        const code = parseInt(message.substr(0, 2), 16);
        if (!fromHost(code)) return;

        if (code === PacketCode.ConnectionPing) {
          ws.isAlive = true;
          return;
        }

        // Store the terminal to forward to connecting clients
        if (code === PacketCode.TerminalContents) connection.lastTerminal = message;

        for (const viewer of connection.viewers) viewer.send(message);
      });

      ws.on("close", () => {
        connection.host = null;
        for (const viewer of connection.viewers) {
          viewer.send(encodePacket(PacketCode.ConnectionLost));
        }
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
      console.log("Dead");
      wsa.close();
      return wsa.terminate();
    }

    wsa.isAlive = false;
    wsa.send(encodePacket(PacketCode.ConnectionPing));
  });
}, 15000);

console.log("Listening on 8080");
server.listen(8080);
