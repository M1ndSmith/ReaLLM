"use client";

import { useMemo } from "react";

import type { ConfigResponse } from "@/lib/types";

export type OperatorState = {
  authState: "open" | "needs_key" | "authorized";
  blockedActions: Array<"chat" | "config" | "admin">;
  message: string | null;
};

export function useOperatorState(config: ConfigResponse | null, needsAuth: boolean): OperatorState {
  return useMemo(() => {
    if (!config?.auth_required) {
      return {
        authState: "open",
        blockedActions: [],
        message:
          "Gateway auth is off. Set GATEWAY_API_KEY and restart to require auth. For any reachable bind, also set GATEWAY_ALLOW_OPEN=0 and GATEWAY_KEY_PEPPER.",
      };
    }
    if (needsAuth || !config.identity) {
      return {
        authState: "needs_key",
        blockedActions: ["chat", "config", "admin"],
        message: "Gateway auth is required. Paste a key with the scopes you need.",
      };
    }
    const scopes = new Set(config.identity.scopes || []);
    const blocked: Array<"chat" | "config" | "admin"> = [];
    for (const scope of ["chat", "config", "admin"] as const) {
      if (!scopes.has(scope)) blocked.push(scope);
    }
    return {
      authState: "authorized",
      blockedActions: blocked,
      message:
        blocked.length === 0
          ? "Authenticated. This key can access chat, config, and admin routes."
          : `Authenticated as ${config.identity.id}, but this key cannot access: ${blocked.join(", ")}.`,
    };
  }, [config, needsAuth]);
}

