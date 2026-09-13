/**
 * These two documents are what Claude.ai fetches BEFORE ever showing
 * the connector as usable — this is the "oauthMetadataFound" step
 * referenced in the Kernel MCP incident (PR #96 there): if these are
 * missing or wrong, Claude falls back to guessing paths, which is
 * exactly the failure mode that made that other project's DCR flow
 * silently fail.
 */

export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers: string[];
  bearer_methods_supported: ["header"];
}

export function protectedResourceMetadata(baseUrl: string): ProtectedResourceMetadata {
  return {
    resource: `${baseUrl}/mcp`,
    authorization_servers: [baseUrl],
    bearer_methods_supported: ["header"],
  };
}

export interface AuthorizationServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
  response_types_supported: ["code"];
  grant_types_supported: ["authorization_code"];
  code_challenge_methods_supported: ["S256"]; // 'plain' intentionally absent
  token_endpoint_auth_methods_supported: ["none"];
}

export function authorizationServerMetadata(baseUrl: string): AuthorizationServerMetadata {
  return {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/authorize`,
    token_endpoint: `${baseUrl}/token`,
    registration_endpoint: `${baseUrl}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  };
}
