"use client";

import { useCallback, useState } from "react";

import { fetchJson } from "@/lib/gateway";
import type { ConfigLayers, ConfigResponse } from "@/lib/types";

export function useRuntimeConfig() {
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [toggleBusy, setToggleBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setConfig(await fetchJson<ConfigResponse>("/config"));
    } catch {
      setConfig(null);
    }
  }, []);

  const toggleLayer = useCallback(async (field: keyof ConfigLayers, value: boolean) => {
    setToggleBusy(field);
    try {
      const next = await fetchJson<ConfigResponse>("/config", {
        method: "PATCH",
        body: JSON.stringify({ layers: { [field]: value } }),
      });
      setConfig(next);
      return next;
    } finally {
      setToggleBusy(null);
    }
  }, []);

  return { config, setConfig, toggleBusy, refresh, toggleLayer };
}
