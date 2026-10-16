import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { io, type Socket } from "socket.io-client";
import type { SocialRoom } from "@pats/shared";
import { useAuth } from "@/auth";
import { ApiFailure } from "@/lib/api";
export function useSocialRoom(
  room: SocialRoom | null,
  changed: () => void,
  lost?: () => void,
) {
  const { call } = useAuth();
  const callbacks = useRef({ changed, lost });
  useEffect(() => {
    callbacks.current = { changed, lost };
  }, [changed, lost]);
  const socket = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const kind = room?.kind,
    id = room?.id;
  useFocusEffect(
    useCallback(() => {
      if (!kind || !id) return;
      let active = true,
        expiry: ReturnType<typeof setTimeout> | undefined;
      async function connect() {
        try {
          const credentials = await call<{ token: string; url: string }>(
            "GET",
            "/api/social/token",
          );
          if (!active) return;
          const client = io(credentials.url, {
            auth: { token: credentials.token },
            transports: ["websocket"],
          });
          socket.current = client;
          client.on("connect", () => {
            setConnected(true);
            client.emit(
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
                      client.disconnect();
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
              client.removeAllListeners();
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
        socket.current?.removeAllListeners();
        socket.current?.disconnect();
        socket.current = null;
      };
    }, [call, kind, id]),
  );
  const send = async (body: unknown) => {
    if (!socket.current?.connected) throw new ApiFailure("NETWORK");
    const result = await socket.current
      .timeout(10000)
      .emitWithAck("message", body)
      .catch(() => {
        throw new ApiFailure("NETWORK");
      });
    if (!result.ok) throw new ApiFailure(result.error ?? "INTERNAL");
  };
  return { connected, send };
}
