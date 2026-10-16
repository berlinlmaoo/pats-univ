"use client";
import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import type { SocialRoom } from "@pats/shared";
export function useRealtime(
  room: SocialRoom | null,
  changed: () => void,
  lost?: () => void,
) {
  const callbacks = useRef({ changed, lost });
  useEffect(() => {
    callbacks.current = { changed, lost };
  }, [changed, lost]);
  const [connected, setConnected] = useState(false);
  const kind = room?.kind,
    id = room?.id;
  useEffect(() => {
    if (!kind || !id) return;
    let active = true,
      expiry: ReturnType<typeof setTimeout> | undefined;
    let client: ReturnType<typeof io> | undefined;
    async function connect() {
      try {
        const response = await fetch("/api/social/token");
        if (!response.ok) throw new Error();
        const credentials = await response.json();
        if (!active) return;
        client = io(credentials.url, {
          auth: { token: credentials.token },
          transports: ["websocket"],
        });
        client.on("connect", () => {
          setConnected(true);
          client!.emit(
            "join",
            { kind, id },
            (result: { ok: boolean; expiresAt?: string }) => {
              if (!result.ok) {
                callbacks.current.lost?.();
                return;
              }
              callbacks.current.changed();
              clearTimeout(expiry);
              if (result.expiresAt) {
                const deadline = Date.parse(result.expiresAt);
                const checkExpiry = () => {
                  const remaining = deadline - Date.now();
                  if (remaining > 0)
                    expiry = setTimeout(
                      checkExpiry,
                      Math.min(remaining, 2147483647),
                    );
                  else {
                    callbacks.current.lost?.();
                    client?.disconnect();
                  }
                };
                checkExpiry();
              }
            },
          );
        });
        client.on("changed", () => callbacks.current.changed());
        client.on("access_lost", () => callbacks.current.lost?.());
        client.on("disconnect", (reason) => {
          setConnected(false);
          if (active && reason === "io server disconnect") {
            client?.removeAllListeners();
            void connect();
          }
        });
        client.on("connect_error", () => setConnected(false));
      } catch {
        if (active) setConnected(false);
      }
    }
    void connect();
    return () => {
      active = false;
      clearTimeout(expiry);
      client?.removeAllListeners();
      client?.disconnect();
    };
  }, [kind, id]);
  return connected;
}
