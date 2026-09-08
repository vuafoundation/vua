# 🛡️ Vortex MCP Server & Execution Gateway

> **Tese Normativa de Segurança:**  
> *"Proof of execution is not proof of safety."*  
> $$\text{Safety} = \text{Authorization} + \text{Bounded Execution} + \text{Accountability} + \text{Independent Verification} + \text{Identity}$$

O **Vortex** é a implementação de referência da especificação de governança e execução criptográfica para agentes de Inteligência Artificial sobre o **Model Context Protocol (MCP)**. Ele assegura que agentes autônomos e modelos LLM operem sob limites matematicamente verificáveis, com provas de execução assinadas em **Ed25519**, canonicalização determinística **RFC 8785 (JCS)** e governança de recursos **GOS3**.

---

## 📚 Guias Passo a Passo na Pasta `docs/`

Para guias detalhados de instalação, execução mobile e integração:

- 📖 [**docs/README.md**](./docs/README.md) — Índice mestre da documentação.
- 📦 [**docs/01-visao-geral-e-instalacao.md**](./docs/01-visao-geral-e-instalacao.md) — CLI `vua`, biblioteca npm, diagnósticos de sistema.
- 📱 [**docs/02-mobile-apk-sem-github.md**](./docs/02-mobile-apk-sem-github.md) — **Passo a passo detalhado para o Passo 2**: APK Android (`com.vortex.foundation.vua`), isolamento SELinux/Scoped Storage, execução sem dependência do GitHub via Capacitor ou Termux.
- 🤖 [**docs/03-llm-browser-e-qwen-gemini.md**](./docs/03-llm-browser-e-qwen-gemini.md) — **Passo a passo detalhado para o Passo 3**: LLM no browser (WebGPU/Wasm), Qwen 2.5 Coder 0.5B local/offline e Google Gemini com API Key segura e prova Ed25519.
- ⚡ [**docs/04-termux-e-alpine-proot.md**](./docs/04-termux-e-alpine-proot.md) — Execução em Termux, Alpine Linux (PRoot), benchmarks de latência (<370µs) e throughput (2.700+ ops/seg).
- 🔌 [**docs/05-adapters-local-vs-github-remoto.md**](./docs/05-adapters-local-vs-github-remoto.md) — GitHub App Remota vs. Adaptadores para múltiplos apps locais (Linux, Android, Windows, MCP para Cursor/Claude/VSCode).

---

## 📑 Sumário

1. [Manual do Usuário & Consumidor LLM](#1-manual-do-usuário--consumidor-llm)
2. [Manual do Desenvolvedor & Operador](#2-manual-do-desenvolvedor--operador)
3. [Entregáveis & Diferenciais Competitivos](#3-entregáveis--diferenciais-competitivos)
4. [Workflow no CI & Portões de Qualidade (100%)](#4-workflow-no-ci--portões-de-qualidade-100)
5. [Arquivos de Cabeçalho GOS3 Verificáveis](#5-arquivos-de-cabeçalho-gos3-verificáveis)
6. [Matriz de Conformidade Adversarial](#6-matriz-de-conformidade-adversarial)

---

## 1. Manual do Usuário & Consumidor LLM

O Vortex pode ser consumido diretamente por agentes através do protocolo **MCP (JSON-RPC 2.0)** ou visualizado por operadores humanos através do **Interactive Governance Workbench**.

### 1.1. As 5 Ferramentas Governadas (Normativas)

Todo agente conectado ao endpoint `POST /mcp` tem acesso a 5 ferramentas fundamentais:

| Ferramenta MCP | Efeito Colateral | Descrição |
| :--- | :--- | :--- |
| `vortex.inspect` | `false` | Inspeção segura e observacional de recursos com emissão de prova. |
| `vortex.propose` | `false` | Geração de propostas de código, patches ou diffs sem aplicação física. |
| `vortex.verify` | `false` | Verificação independente de assinaturas Ed25519 e hashes SHA-256. |
| `vortex.execute` | `true` | Execução delimitada dentro da sandbox e com sessão ativa GOS3. |
| `vortex.branch.write` | `true` | Escrita persistente em branches; exige aprovação humana e política explícita. |

### 1.2. Exemplo de Chamada MCP (JSON-RPC 2.0)

```bash
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "req-001",
    "method": "tools/call",
    "params": {
      "name": "vortex.inspect",
      "arguments": {
        "request_id": "req-inspect-101",
        "target": { "repository": "scoobiii/vortex", "path": "src/main.ts" },
        "input": { "verbose": true }
      }
    }
  }'
```

### 1.3. Entendendo a Prova de Execução (`ExecutionProof v1`)

Toda chamada gera uma prova criptográfica não-repudiável:

```json
{
  "proof_version": "1",
  "request_id": "req-inspect-101",
  "execution_id": "exec-1741452000-abc123",
  "runtime_id": "vortex-node-runtime-v1",
  "agent_id": "agent/llm-vortex",
  "principal_id": "scoobiii",
  "connector_id": "connector-filesystem-v1",
  "operation": "inspect",
  "executed": true,
  "status": "EXECUTION_SUCCESS",
  "input_hash": "sha256:d800dd8b4f177fc634beff6fe193e...",
  "output_hash": "sha256:24809582b25160572ce1d140cd09...",
  "started_at": "2026-09-08T16:40:00.000Z",
  "completed_at": "2026-09-08T16:40:00.005Z",
  "duration_ms": 5,
  "policy_id": "vortex-development",
  "policy_version": "1.0.0",
  "gos3_session_id": "gos3-sess-1741452000-xyz",
  "sandbox_id": "sandbox-fs-1741452000",
  "identity": {
    "key_id": "vortex-ed25519-primary",
    "algorithm": "Ed25519",
    "signature": "c2lnbmF0dXJlLWJhc2U2NC1lZDI1NTE5..."
  }
}
```

> ⚠️ **Semântica de Falha Honesta:**  
> Se uma operação for barrada por política (`POLICY_DENIED`) ou tentativa de escape da sandbox (`SANDBOX_DENIED`), a prova é **emitida com `executed = false`**. O Vortex nunca oculta rejeições de segurança.

---

## 2. Manual do Desenvolvedor & Operador

### 2.1. Como Executar Localmente

```bash
# 1. Instalar dependências
npm install

# 2. Executar em modo de desenvolvimento (servidor Node 22 + interface Vite)
npm run dev

# 3. Executar a suíte completa de testes e conformidade (100% de cobertura)
npm test

# 4. Verificar os cabeçalhos de contrato GOS3
npm run verify:gos3

# 5. Compilar para produção
npm run build && npm start
```

### 2.2. Arquitetura Modular (`/src/vortex`)

- **`canonicalize.ts`**: Implementação pura do RFC 8785 (JSON Canonicalization Scheme - JCS) com ordenação de chaves em unidades de código UTF-16.
- **`crypto.ts`**: Primitivas criptográficas nativas Node 22 (`node:crypto` Ed25519 e SHA-256).
- **`gateway.ts`**: O pipeline de execução em 8 etapas estritas:
  $$\text{REQUEST} \to \text{IDENTITY} \to \text{AUTHORIZATION} \to \text{LIMITS} \to \text{ONBOARD} \to \text{EXECUTION} \to \text{PROOF} \to \text{VERIFICATION}$$
- **`mcp-server.ts`**: Roteador compatível com a especificação Model Context Protocol.
- **`gos3.ts`**: Motor de onboarding de recursos e governança de sessões efêmeras.
- **`sandbox.ts`**: Verificador de limites de filesystem (resolução de caminhos canônicos, bloqueio de `../`, bytes nulos e prefixos irmãos).
- **`policy.ts`**: Motor de avaliação de políticas e checagem de aprovação humana.
- **`verifier.ts`**: Verificador independente que audita 10 invariantes sem confiar no executor.
- **`evidence.ts`**: Motor de benchmark e cálculo do hash canônico de evidência para CI.
- **`conformance.ts`**: Suíte de 10 testes E2E e 5 cenários adversariais.

### 2.3. Endpoints REST da API

| Método | Rota | Descrição |
| :--- | :--- | :--- |
| `POST` | `/mcp` | Protocolo MCP oficial (JSON-RPC 2.0). |
| `GET` | `/.well-known/vortex-keys` | Descoberta pública de chaves ativas (RFC 5785). |
| `POST` | `/api/vortex/execute` | Invocação direta do pipeline do Gateway. |
| `POST` | `/api/vortex/verify` | Auditoria de prova pelo Verificador Independente. |
| `GET` | `/api/vortex/evidence` | Evidence Hash canônico e métricas de benchmark. |
| `POST` | `/api/vortex/conformance` | Execução da suíte adversarial sob demanda. |
| `POST` | `/api/vortex/gos3/session` | Criação de sessões autorizadas de onboarding GOS3. |

---

## 3. Entregáveis & Diferenciais Competitivos

### 3.1. Tabela Comparativa de Entregáveis

| Funcionalidade / Invariante | Agente Convencional | Frameworks de "Guardrail" | Vortex MCP + Gateway |
| :--- | :---: | :---: | :---: |
| **Garantia de Identidade** | Baseada em prompt / token fraco | API Keys / Bearer Token | **Criptografia Ed25519 por operação** |
| **Determinismo de Assinatura** | Não aplicável | Inconsistente (JSON comum) | **RFC 8785 (JCS determinístico)** |
| **Auditabilidade de Falhas** | Silenciosa / logs comuns | Registrada em log interno | **Prova assinada com `executed=false`** |
| **Verificação Independente** | Inexistente | Caixa-preta do provedor | **Auditoria de confiança zero (10 invariantes)** |
| **Defesa contra Path Traversal** | Relativa / regex básica | Filtros de texto | **Isolamento de raiz e prefixo irmão** |
| **Proteção Anti-Replay** | Inexistente | Rara / por janela de tempo | **Cache de nonce temporal imutável** |
| **Governança de Recursos** | Acesso livre se tiver path | Baseada em permissão estática | **GOS3: Onboarding prévio obrigatório** |
| **Evidência no CI** | Apenas logs do runner | Relatórios JUnit | **Hash Canônico SHA-256 de Evidência** |

### 3.2. Principais Diferenciais Técnicos

1. **Assinatura Criptográfica Ed25519 & RFC 8785:** A assinatura é calculada sobre a representação canônica exata do payload, garantindo interoperabilidade entre diferentes linguagens (Node, Go, Rust, Python).
2. **Verificador Independente de Confiança Zero:** O verificador recancula todos os hashes a partir dos dados de entrada e saída, checa o tempo de vida, o nonce e a assinatura sem aceitar qualquer alegação do executor.
3. **Isolamento de Sandbox à Prova de Sibling Prefix:** Impede que um caminho como `/workspace/vortex` seja burlado acessando `/workspace/vortex-evil`.

---

## 4. Workflow no CI & Portões de Qualidade (100%)

O pipeline do GitHub Actions (`.github/workflows/vortex-ci.yml`) implementa um portão rigoroso onde **nenhum merge é permitido sem 100% de conformidade**.

### 📋 Checklist de Qualidade do CI:

- [x] **100% de Cobertura de Código e Contratos**
- [x] **Testes Unitários:**
  - Canonicalização determinística RFC 8785 (ordenação UTF-16 code units, escape sequences).
  - Assinatura e validação Ed25519 nativa.
  - Hashing padronizado SHA-256 com prefixo `sha256:`.
  - Motor de políticas (autorização de leitura, bloqueio de escrita em main, tokens de aprovação).
  - Isolamento de caminhos da sandbox (`../`, bytes nulos e prefixos irmãos).
- [x] **Testes de Integração (10/10 Foundation E2E):**
  - E2E-001 até E2E-010 cobrindo fluxo completo MCP $\to$ Gateway $\to$ Sandbox $\to$ Prova $\to$ Verificador.
- [x] **Testes Adversariais:**
  - 5 cenários negativos validados (`FORGE`, `REPLAY`, `ESCALATE`, `ESCAPE`, `TAMPER`).
- [x] **Testes de Stress & Concorrência:**
  - 100 invocações paralelas concorrentes simultâneas sem colisões de nonces ou vazamento de estado.
- [x] **Testes de Performance & Benchmark:**
  - Medição de RPS, p50, p95 e p99 comparados contra a Baseline Normativa (Composite Score $\ge$ Baseline).
- [x] **Testes de Degradação:**
  - Resiliência sob payloads gigantes (5MB+), contenção de limites de memória e thresholds de timeout (1ms).
- [x] **Testes de Caos:**
  - Injeção de chaves corrompidas, sessões revogadas e integridade sob falhas estruturais.
- [x] **Auditoria de Cabeçalhos GOS3:**
  - Verificação rigorosa de integridade de checksum de todos os arquivos governados.

---

## 5. Arquivos de Cabeçalho GOS3 Verificáveis

A especificação **GOS3 (§8)** define que nenhum recurso crítico pode ser modificado por um agente sem onboarding prévio e um contrato rastreável.

### 5.1. Formato do Cabeçalho GOS3

Os arquivos governados carregam o bloco de contrato `@gos3-contract` no topo:

```typescript
/**
 * @gos3-contract
 * @version 1.0.0
 * @resource /src/governed/governed-vault.ts
 * @checksum sha256:24809582b25160572ce1d140cd09fb5a0bafad2005258ba41414e02737de48b5
 * @capability repository.write
 * @onboarded_at 2026-09-08T09:48:00.000Z
 * @governed true
 */
```

### 5.2. Como Funciona a Verificação

O algoritmo de verificação calcula o hash SHA-256 do conteúdo do arquivo **excluindo o próprio bloco de comentário**, comparando-o com o `@checksum` declarado:

1. **Localmente:**
   ```bash
   npm run verify:gos3
   ```
2. **No CI (GitHub Actions):**
   O passo `Audit GOS3 Contract Headers` roda `npx tsx scripts/verify-gos3-headers.ts --strict`. Se qualquer arquivo tiver sido adulterado sem autorização ou tiver hash incorreto, o pipeline falha imediatamente com código 1.

---

## 6. Matriz de Conformidade Adversarial

A suíte adversarial testa ativamente as 5 violações de segurança fundamentais:

| Cenário | Ataque Simulado | Status Esperado | Ação Defensiva do Vortex |
| :--- | :--- | :--- | :--- |
| **FORGE** | Modificação de `output_hash` ou flag `executed` na prova. | `SIGNATURE_INVALID` | Rejeição imediata pela chave pública Ed25519. |
| **REPLAY** | Reenvio do mesmo `request_id` com payload idêntico. | `REPLAY_REJECTED` | O cache de anti-replay bloqueia a reexecução. |
| **ESCALATE** | Tentativa de escrita persistente com política somente-leitura. | `POLICY_DENIED` | Prova é emitida com `executed = false`. |
| **ESCAPE** | Ataque de path traversal (`../../etc/passwd`) ou prefixo irmão. | `SANDBOX_DENIED` | A sandbox isola o caminho antes de invocar o conector. |
| **TAMPER** | Adulteração do artefato físico após a execução ser concluída. | `HASH_MISMATCH` | O verificador detecta a discrepância no hash SHA-256. |

---

## 7. Evidência de Execução Canônica (CI Provenance)

Cada execução da suíte completa produz o objeto de evidência canônico:

```json
{
  "schema": "vortex-execution-evidence/v1",
  "module": "foundation-integration",
  "commit_sha": "856920785b8392b036211cc851e1f6467961ff52",
  "ci": {
    "provider": "github-actions",
    "run_id": "34228487367",
    "run_attempt": "1",
    "workflow": "vortex-foundation-ci.yml"
  },
  "result": {
    "build": "PASS",
    "tests": "PASS",
    "coverage": "100%",
    "integration": "PASS",
    "security": "PASS",
    "stress": "PASS",
    "performance": "PASS",
    "degradation": "PASS"
  },
  "canonical_hash": "sha256:b3a6ebbdf9b4561edfc27077da9070fde367ab6ced4c9a3d958ff69539ee20cb"
}
```

Disponível em tempo de execução via `GET /api/vortex/evidence`.
