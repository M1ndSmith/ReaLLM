"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchJson, gatewayUrl, GatewayError } from "@/lib/gateway";
import { budgetText } from "@/lib/formatters";
import type { HealthResponse, ModelInfo, PromptListItem } from "@/lib/types";

const MODEL_KEY = "realmm.model";

export type Catalog = {
  health: HealthResponse | null;
  models: ModelInfo[];
  prompts: PromptListItem[];
};

export type CatalogLoadResult =
  | { ok: true }
  | { ok: false; unauthorized: boolean; message: string };

export function useGatewayCatalog() {
  const gateway = gatewayUrl();
  const [catalog, setCatalog] = useState<Catalog>({ health: null, models: [], prompts: [] });
  const [model, setModel] = useState("");
  const [promptName, setPromptName] = useState("");

  const load = useCallback(async (): Promise<CatalogLoadResult> => {
    try {
      const [health, modelsBody, promptsBody] = await Promise.all([
        fetchJson<HealthResponse>("/health"),
        fetchJson<{ models: ModelInfo[] }>("/models"),
        fetchJson<{ prompts: PromptListItem[] }>("/prompts"),
      ]);
      const models = modelsBody.models || [];
      setCatalog({ health, models, prompts: promptsBody.prompts || [] });
      const stored = sessionStorage.getItem(MODEL_KEY);
      const next = models.some((item) => item.id === stored) ? stored : models[0]?.id || "";
      setModel(next || "");
      return { ok: true };
    } catch (err) {
      setCatalog({ health: null, models: [], prompts: [] });
      const message =
        err instanceof Error
          ? err.message
          : `Could not reach the gateway at ${gateway}. Start uvicorn on port 8000.`;
      if (err instanceof GatewayError && err.status === 401) {
        return { ok: false, unauthorized: true, message };
      }
      return { ok: false, unauthorized: false, message };
    }
  }, [gateway]);

  useEffect(() => {
    if (model) sessionStorage.setItem(MODEL_KEY, model);
  }, [model]);

  const lamps = useMemo(() => {
    const health = catalog.health;
    return [
      { key: "memory", label: "memory", on: Boolean(health?.memory?.enabled) },
      { key: "pii", label: "pii", on: Boolean(health?.pii?.enabled) },
      { key: "guard", label: "guard", on: Boolean(health?.guard?.enabled) },
      { key: "redis", label: "redis", on: Boolean(health?.reliability?.redis) },
      { key: "budget", label: budgetText(health), on: health?.budget != null },
    ];
  }, [catalog.health]);

  return { catalog, model, setModel, promptName, setPromptName, load, lamps, gateway };
}
