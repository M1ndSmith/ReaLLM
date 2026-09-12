"use client";

import { useCallback, useState } from "react";

import { fetchJson } from "@/lib/gateway";
import type { ConfigLayers, ConfigResponse } from "@/lib/types";

export function useRuntimeConfig() {
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [toggleBusy, setToggleBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const next = await fetchJson<ConfigResponse>("/config");
      setConfig(next);
      setConfigError(null);
      return next;
    } catch (err) {
      setConfig(null);
      setConfigError(err instanceof Error ? err.message : "Could not load runtime config.");
      throw err;
    } finally {
      setRefreshing(false);
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
      setConfigError(null);
      return next;
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : "Could not update runtime config.");
      throw err;
    } finally {
      setToggleBusy(null);
    }
  }, []);

  return { config, setConfig, configError, refreshing, toggleBusy, refresh, toggleLayer };
}
