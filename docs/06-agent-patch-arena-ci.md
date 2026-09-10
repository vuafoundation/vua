# Arquitetura Multi-Agente: Fork Concorrente, Patch Arena & CI Darwiniano

> **Vortex Open Governance Protocol — Especificação Técnica de Seleção de Patches**  
> *Resolvendo o problema de concorrência e conflitos entre múltiplos agentes de IA através de competição mensurável e auto-merge no CI.*

---

## 1. O Problema da Concorrência Direta na `main`

Quando múltiplos agentes de IA (ex.: Gemini, Claude, Qwen, DeepSeek, Codex ou instâncias paralelas de desenvolvedores) tentam sincronizar alterações diretamente na mesma branch:
1. **Conflitos de Merge Frequentes (`git conflict`):** Linhas concorrentes no mesmo arquivo bloqueiam a sincronização.
2. **Degradação Silenciosa:** Um agente pode sobrescrever regras de segurança ou testes criados por outro.
3. **Falta de Critério Objetivo:** Sem benchmark padronizado, é impossível saber qual agente produziu o código mais performático, seguro e sucinto.

---

## 2. A Solução: Arquitetura de Fork Isolado & Patch Tournament

Em vez de competir no mesmo repositório ou comitar na `main`:

```text
               ┌─── Agente Gemini ─────> Fork A (branch: patch-strict-router) ──┐
               │                                                                │
Meta-Demanda ──┼─── Agente Qwen Local ─> Fork B (branch: patch-zero-dep) ───────┼──> GitHub CI: Patch Arena
               │                                                                │    (Canary + VUA-100 + RPS vs Base)
               └─── Agente Claude ─────> Fork C (branch: patch-matrix-audit) ───┘                │
                                                                                                 ▼
                                                                                   🥇 Rank #1: Auto-Merge na 'main'
                                                                                   (Se e somente se: PASS_SUPERIOR)
                                                                                   ❌ Desqualificados: Zero efeito colateral
```

### 2.1. Princípios Operacionais

1. **Isolamento Total via Forks:**  
   Cada agente executa em seu próprio fork ou branch prefixada (`agent/<name>/patch-<id>`). Ninguém toca na `main` diretamente.
2. **Zero Conflito Humano:**  
   Como os forks são paralelos, nenhuma branch intermediária trava a outra.
3. **Avaliação Criptográfica e Determinística:**  
   O CI atua como árbitro imparcial. Ele aplica o patch em um ambiente limpo de contêiner e executa a bateria de gates.

---

## 3. Cláusula de Sujeição Universal ao CI ("Quem propor patch está sujeito ao CI")

> **Axioma Normativo VUA:**  
> Nenhum ator — seja o mantenedor humano principal, um modelo de fundação (Gemini, Claude, GPT, Qwen), bot de CI ou fork de terceiros — tem autoridade para forçar merge na branch `main` sem validação e aprovação do CI.

- **Zero Privilégio:** Ninguém possui token de bypass de branch protection.
- **Invariantes Invioláveis:** O CI roda os 5 testes Canary de efeito colateral zero. Falhar em 1 = eliminação imediata.
- **Isomrfismo de Proponentes:** O código é avaliado pelo que ele executa e comprova (`Proof over Prose`), não por quem o propôs.

---

## 4. Inteligência de Medição de Ganho Base ($\Delta_{\text{gain}}$)

O CI não aprova patches apenas por cumprirem uma pontuação arbitrária estática. Ele mede **ativamente o ganho comparativo** do patch candidato contra o estado consolidado da branch `main` (**Baseline**).

### 4.1. Fórmula de Ganho Comparativo

$$\Delta_{\text{gain}} = \text{Score}_{\text{candidato}} - \text{Score}_{\text{baseline}}$$

$$\Delta_{\text{RPS}} = \left(\frac{\text{RPS}_{\text{candidato}} - \text{RPS}_{\text{baseline}}}{\text{RPS}_{\text{baseline}}}\right) \times 100\%$$

$$\Delta_{\text{latência}} = \left(\frac{p95_{\text{baseline}} - p95_{\text{candidato}}}{p95_{\text{baseline}}}\right) \times 100\%$$

### 4.2. Critério de Aprovação Normativo

| Veredito CI | Condição Matemática | Ação de Merge |
|---|---|---|
| **`PASS_SUPERIOR`** | • 5/5 Canary Invariants Passed (100%)<br>• $\Delta_{\text{gain}} > 0$ (Superou a base)<br>• $p95_{\text{candidato}} \le p95_{\text{baseline}}$ e $\text{RPS}_{\text{candidato}} \ge \text{RPS}_{\text{baseline}}$ | **APROVADO:** Elegível para Auto-Merge (*Fast-Forward*) imediato na `main`. |
| **`PASS_ACCEPTABLE`** | • 5/5 Canary Invariants Passed<br>• $\Delta_{\text{gain}} \approx 0$ (Neutro, sem ganho líquido de performance/acurácia) | **REVISÃO MANUAL:** Congelado até que um humano analise se há valor não mensurado. |
| **`FAIL_REGRESSION`** | • $\Delta_{\text{gain}} < 0$ (Regrediu latência, caiu vazão ou degradou acurácia) | **REJEITADO:** Bloqueio imediato de merge. |
| **`DISQUALIFIED`** | • Falha em qualquer teste Canary (mutação sem aprovação, escape de sandbox) | **ELIMINADO:** Score = 0; log de auditoria emitido. |

---

## 5. O Pipeline no GitHub Actions (`agent-patch-arena.yml`)

1. **Gatilho:** O agente ou desenvolvedor abre uma Pull Request a partir de seu fork.
2. **Execução Isolada:** O CI faz o checkout da base `main` (executa benchmark baseline) e aplica o patch candidato.
3. **Auditoria Canary:** Roda `scripts/test-canary.ts`. Se falhar, rotula o PR com `safety-failed` e cancela a avaliação.
4. **Comparador Inteligente:** Roda `scripts/agent-patch-arena.ts`, comparando candidato vs. baseline.
5. **Leaderboard Público com $\Delta$:** O bot posta a tabela comparativa de deltas nos comentários do PR.
6. **Decisão Automática:** Se o veredito for `PASS_SUPERIOR` e `auto_merge_winner: true`, o GitHub Actions realiza o merge limpo (*fast-forward*) para a `main`.

---

## 6. Como Executar Localmente

Para simular o torneio entre candidatos a qualquer momento:

```bash
# Executa a arena de patches com inteligência de ganho base
npx tsx scripts/agent-patch-arena.ts
```
