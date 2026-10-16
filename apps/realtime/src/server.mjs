import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { pathToFileURL } from "node:url";
import { jwtVerify } from "jose";
import { Server } from "socket.io";

/** One process is sufficient for the showcase. The API owns persistence and city policy. */
export function createRealtime({
  apiUrl,
  authSecret,
  publishSecret,
  origins = [],
  port = 4000,
}) {
  if (
    !apiUrl ||
    !authSecret ||
    authSecret.length < 32 ||
    !publishSecret ||
    publishSecret.length < 32
  )
    throw new Error("Realtime configuration missing");
  const key = new TextEncoder().encode(`${authSecret}:access`);
  const roomName = (r) => `${r.kind}:${r.id}`;
  const validRoom = (r) =>
    r &&
    ["channel", "conversation", "attendance", "draw", "wallet"].includes(r.kind) &&
    typeof r.id === "string" &&
    /^[A-Za-z0-9_-]{1,100}$/.test(r.id);
  async function api(token, path, body) {
    const res = await fetch(`${apiUrl}/api/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.code ?? "INTERNAL");
    return json;
  }
  const http = createServer(async (req, res) => {
    if (req.url === "/health") {
      res
        .writeHead(200, { "Content-Type": "application/json" })
        .end('{"ok":true,"service":"realtime"}');
      return;
    }
    const supplied = req.headers.authorization ?? "",
      expected = `Bearer ${publishSecret}`;
    if (
      req.url !== "/publish" ||
      req.method !== "POST" ||
      Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
    ) {
      res.writeHead(403).end();
      return;
    }
    try {
      let body = "";
      for await (const part of req) {
        body += part;
        if (body.length > 1000) throw new Error("VALIDATION");
      }
      const room = JSON.parse(body);
      if (!validRoom(room)) throw new Error("VALIDATION");
      // Only an invalidation is broadcast. Content always passes current REST authorization.
      io.to(roomName(room)).emit("changed", room);
      res.writeHead(204).end();
    } catch {
      res.writeHead(400).end();
    }
  });
  const io = new Server(http, {
    cors: { origin: origins },
    maxHttpBufferSize: 16384,
    transports: ["websocket", "polling"],
  });
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (typeof token !== "string") throw new Error("UNAUTHENTICATED");
      const { payload } = await jwtVerify(token, key, {
        issuer: "pats-univ",
        algorithms: ["HS256"],
      });
      if (!payload.sub || !payload.sid || !payload.exp)
        throw new Error("UNAUTHENTICATED");
      await api(token, "me");
      socket.data.token = token;
      socket.data.exp = payload.exp * 1000;
      next();
    } catch {
      next(new Error("UNAUTHENTICATED"));
    }
  });
  io.on("connection", (socket) => {
    const joined = new Map();
    let count = 0,
      windowStart = Date.now();
    const tokenTimer = setTimeout(
      () => socket.disconnect(true),
      Math.max(1, socket.data.exp - Date.now()),
    );
    const guard = setInterval(async () => {
      for (const [name, room] of joined) {
        try {
          const result = await api(socket.data.token, "social/socket", room);
          if (result.expiresAt && Date.parse(result.expiresAt) <= Date.now())
            throw new Error("FORBIDDEN");
        } catch {
          socket.leave(name);
          joined.delete(name);
          socket.emit("access_lost", room);
        }
      }
    }, 15000);
    socket.on("join", async (room, reply) => {
      const ack = typeof reply === "function" ? reply : () => {};
      try {
        if (!validRoom(room) || joined.size >= 4) throw new Error("VALIDATION");
        const result = await api(socket.data.token, "social/socket", room);
        await socket.join(roomName(room));
        joined.set(roomName(room), room);
        ack({ ok: true, ...result });
      } catch (e) {
        ack({ ok: false, error: e.message });
      }
    });
    socket.on("leave", (room) => {
      if (validRoom(room)) {
        socket.leave(roomName(room));
        joined.delete(roomName(room));
      }
    });
    socket.on("message", async (input, reply) => {
      const ack = typeof reply === "function" ? reply : () => {};
      try {
        if (Date.now() - windowStart >= 60000) {
          count = 0;
          windowStart = Date.now();
        }
        if (++count > 60) throw new Error("RATE_LIMITED");
        const result = await api(socket.data.token, "social/messages", input);
        ack({ ok: true, ...result });
      } catch (e) {
        ack({ ok: false, error: e.message });
      }
    });
    socket.on("disconnect", () => {
      clearTimeout(tokenTimer);
      clearInterval(guard);
    });
  });
  return {
    io,
    http,
    listen: () =>
      new Promise((resolve) => http.listen(port, "127.0.0.1", resolve)),
    close: () => new Promise((resolve) => io.close(resolve)),
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const server = createRealtime({
    apiUrl: process.env.API_URL,
    authSecret: process.env.AUTH_SECRET,
    publishSecret: process.env.REALTIME_SECRET,
    origins: (process.env.CORS_ORIGINS ?? "").split(",").filter(Boolean),
    port: Number(process.env.PORT ?? 4000),
  });
  // Containers need all interfaces; the exported test server defaults to loopback.
  server.http.listen(Number(process.env.PORT ?? 4000), "0.0.0.0", () =>
    console.log("[realtime] ready"),
  );
}
