import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { SignJWT } from "jose";
import { io } from "socket.io-client";
import { createRealtime } from "../src/server.mjs";
const secret = "test-secret-with-at-least-thirty-two-characters";
test("JWT authentication, room authorization, message persistence and private publishing", async () => {
  const api = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    if (body.id === "other-city") {
      res
        .writeHead(403, { "Content-Type": "application/json" })
        .end('{"error":{"code":"FORBIDDEN"}}');
      return;
    }
    res
      .writeHead(200, { "Content-Type": "application/json" })
      .end(
        req.url === "/api/social/messages"
          ? '{"id":"saved"}'
          : '{"expiresAt":null}',
      );
  });
  await new Promise((r) => api.listen(0, "127.0.0.1", r));
  const rt = createRealtime({
    apiUrl: `http://127.0.0.1:${api.address().port}`,
    authSecret: secret,
    publishSecret: secret,
    port: 0,
  });
  await rt.listen();
  const url = `http://127.0.0.1:${rt.http.address().port}`;
  const clients = [];
  try {
    const bad = io(url, {
      auth: { token: "fake" },
      transports: ["websocket"],
      reconnection: false,
    });
    clients.push(bad);
    await new Promise((resolve) =>
      bad.once("connect_error", (e) => {
        assert.equal(e.message, "UNAUTHENTICATED");
        resolve();
      }),
    );
    const token = await new SignJWT({ sid: "session" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user")
      .setIssuer("pats-univ")
      .setExpirationTime("5m")
      .sign(new TextEncoder().encode(`${secret}:access`));
    const client = io(url, { auth: { token }, transports: ["websocket"] });
    clients.push(client);
    await new Promise((r) => client.once("connect", r));
    assert.equal(
      (await client.emitWithAck("join", { kind: "channel", id: "other-city" }))
        .ok,
      false,
    );
    assert.equal(
      (await client.emitWithAck("join", { kind: "channel", id: "my-city" })).ok,
      true,
    );
    assert.equal(
      (
        await client.emitWithAck("message", {
          channelId: "my-city",
          body: "hello",
        })
      ).id,
      "saved",
    );
    assert.equal(
      (await fetch(`${url}/publish`, { method: "POST", body: "{}" })).status,
      403,
    );
    const changed = new Promise((r) => client.once("changed", r));
    await fetch(`${url}/publish`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ kind: "channel", id: "my-city" }),
    });
    assert.deepEqual(await changed, { kind: "channel", id: "my-city" });
  } finally {
    for (const c of clients) c.disconnect();
    await rt.close();
    await new Promise((r) => api.close(r));
  }
});
