"use client";

import { useCallback, useEffect, useState } from "react";

import { getGatewayKey, setGatewayKey as persistGatewayKey } from "@/lib/auth";

export function useGatewayKey() {
  const [gatewayKey, setGatewayKeyState] = useState("");
  const [needsAuth, setNeedsAuth] = useState(false);

  useEffect(() => {
    setGatewayKeyState(getGatewayKey());
  }, []);

  const saveKey = useCallback(() => {
    persistGatewayKey(gatewayKey);
  }, [gatewayKey]);

  return {
    gatewayKey,
    setGatewayKeyState,
    needsAuth,
    setNeedsAuth,
    saveKey,
  };
}
