# Vortex / VUA Full Audit Report

**Data:** 2026-09-13  
**Escopo:** `scoobiii/vortex` core, `vuafoundation/vua` implementation e `vua-oauth` transport authorization package.

## Resultado executivo

A implementação atende os invariantes principais do Vortex/VUA: execução governada, autorização separada de aprovação de mutação, prevenção de replay, provas Ed25519, verificação independente, limites de sandbox e adaptadores multiambiente. Os gates existentes da implementação VUA passaram integralmente, o core passou build e gateway tests, e o pacote OAuth passou 34 testes de conformance.

O audit gate reproduzível terminou com **Failures: 0 / FULL AUDIT: PASS**.

## Correções aplicadas

| Área | Correção |
|---|---|
| Core gateway | Token explícito obrigatório; removido bypass de autenticação em desenvolvimento. |
| Core gateway | Rate limiting por origem, proteção contra replay e allowlist de operações do manifesto. |
| VUA server | CORS por allowlist; SSE sem wildcard; APIs sensíveis exigem `VUA_API_TOKEN`. |
| VUA GitHub | Removido login demo, inventário de repositórios fictício e SHA default fabricado. |
| VUA evidence | Removidos commit/CI/benchmark hardcoded; evidência sem contexto real fica explicitamente não aprovada. |
| VUA LLM | `baseUrl` com validação anti-SSRF; LLM local limitado a loopback; chaves do corpo HTTP ignoradas. |
| OAuth | Limite de payload, headers `no-store`/`nosniff` e comando `npm test` formalizado. |
| Dependências | `qs` fixado em versão corrigida via `overrides`; auditoria npm sem vulnerabilidades moderadas. |

## Validação executada

```text
VUA lint                         PASS
VUA build                        PASS
VUA full conformance suite       PASS (100% dos gates internos)
VUA npm audit                    PASS
Core build                       PASS
Core gateway tests               PASS
OAuth build + conformance       PASS (34/34)
OAuth npm audit                  PASS
Full audit script                PASS (0 failures)
```

O build da VUA ainda emite um warning conhecido do esbuild sobre `import.meta` em `scripts/test-canary.ts` quando o bundle do servidor usa CommonJS. Isso não quebra o build nem os testes, mas deve ser removido em uma limpeza posterior, preferencialmente separando scripts de teste do bundle de produção.

## Contrato operacional

### Desenvolvedor

```bash
# implementação VUA
npm ci
npm run lint
npm run build
npm test
npm audit --omit=dev --audit-level=moderate

# core Vortex
cd ../vortex-core
npm ci
npm run build
npm run test:gateway

# OAuth
cd ../vua-oauth
npm ci
npm test
npm audit --omit=dev --audit-level=moderate
```

### Usuário/operador

Defina `VUA_API_TOKEN` antes de expor a implementação VUA. Defina `VUA_ALLOWED_ORIGINS` com origens exatas, separadas por vírgula; não use `*`. Para GitHub, conecte um token real pelo endpoint de conexão. Para OAuth, defina `OAUTH_OWNER_PRINCIPAL_ID`, `OAUTH_OWNER_PASSCODE` com pelo menos 12 caracteres e `OAUTH_SESSION_SECRET` com pelo menos 16 caracteres.

O OAuth é autenticação de transporte. Ele não substitui `approval_token`, sessão GOS3, política, sandbox ou autorização específica de uma operação mutável.

### Agente

O agente deve usar `request_id` único por tentativa, declarar `connector_id` e `operation` que existam no manifesto, fornecer autorização com escopo mínimo e tratar `409 replay_detected`, `403 operation_not_authorized`, `401 authentication_required` e falhas de prova como estados terminais. Não deve interpretar evidência sem `commit_sha` e `ci.run_id` reais como prova de CI.

## Auditoria reproduzível

Execute a partir da implementação VUA:

```bash
VORTEX_CORE_DIR=/caminho/para/vortex-core \
VUA_OAUTH_DIR=/caminho/para/vua-oauth \
./scripts/audit-full.sh
```

O script verifica diretórios, lint, build, conformance, dependências, markers de dados fictícios, wildcard CORS, autenticação do core e testes OAuth.

## Limites conhecidos

A VUA ainda é uma aplicação com estado de sessão GitHub em memória e o OAuth SQLite é deliberadamente single-instance. Para múltiplas réplicas, a sessão e o `OAuthStore` precisam migrar para armazenamento compartilhado. O endpoint de benchmark deve consumir resultados de uma execução real de CI ou benchmark; o runtime não deve inventar métricas.

O pacote OAuth implementa o servidor de autorização de transporte, mas a montagem efetiva no endpoint MCP deve chamar `requireBearer` antes de encaminhar qualquer mensagem MCP. A aprovação humana/GOS3 continua sendo uma camada separada para operações com efeitos colaterais.
