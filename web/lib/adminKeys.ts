import { fetchJson } from "@/lib/gateway";
import type { GatewayKeyCreated, IdentityPublic } from "@/lib/types";

export async function listGatewayKeys(includeRevoked = false): Promise<IdentityPublic[]> {
  const query = includeRevoked ? "?include_revoked=true" : "";
  const body = await fetchJson<{ keys: IdentityPublic[] }>(`/admin/keys${query}`);
  return body.keys || [];
}

export async function createGatewayKey(payload: {
  key_id: string;
  scopes: string[];
  label?: string;
}): Promise<GatewayKeyCreated> {
  return fetchJson<GatewayKeyCreated>("/admin/keys", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function revokeGatewayKey(keyId: string): Promise<IdentityPublic> {
  return fetchJson<IdentityPublic>(`/admin/keys/${encodeURIComponent(keyId)}`, { method: "DELETE" });
}
