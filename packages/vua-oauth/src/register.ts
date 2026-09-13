import { randomUUID } from "node:crypto";
import { OAuthError, type OAuthStore, type RegisteredClient } from "./types.js";

export interface DcrRequest {
  client_name?: string;
  redirect_uris: string[];
  token_endpoint_auth_method?: string;
  grant_types?: string[];
  response_types?: string[];
}

export interface DcrResponse {
  client_id: string;
  client_name?: string;
  redirect_uris: string[];
  token_endpoint_auth_method: "none";
  grant_types: ["authorization_code"];
  response_types: ["code"];
}

/**
 * Claude.ai performs DCR automatically when the person taps "Adicionar"
 * with "Requer início de sessão" ON — it never asks a human for a
 * client_id/secret up front. We register it as a PUBLIC client
 * (token_endpoint_auth_method: "none") because PKCE is the only
 * client authentication we require; issuing a client_secret we'd
 * then have to protect adds risk without adding security here.
 */
export function registerClient(req: DcrRequest, store: OAuthStore): DcrResponse {
  if (!Array.isArray(req.redirect_uris) || req.redirect_uris.length === 0) {
    throw new OAuthError("invalid_request", "redirect_uris is required and must be non-empty");
  }
  for (const uri of req.redirect_uris) {
    let parsed: URL;
    try {
      parsed = new URL(uri);
    } catch {
      throw new OAuthError("invalid_request", `redirect_uri '${uri}' is not a valid absolute URL`);
    }
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
      throw new OAuthError("invalid_request", `redirect_uri '${uri}' must be https (or localhost for testing)`);
    }
  }

  const client: RegisteredClient = {
    client_id: `client-${randomUUID()}`,
    client_name: req.client_name,
    redirect_uris: req.redirect_uris,
    token_endpoint_auth_method: "none",
    created_at: Date.now(),
  };
  store.saveClient(client);

  return {
    client_id: client.client_id,
    client_name: client.client_name,
    redirect_uris: client.redirect_uris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code"],
    response_types: ["code"],
  };
}
