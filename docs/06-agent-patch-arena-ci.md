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
               │                                                                │    (Canary + VUA-100 + RPS)
               └─── Agente Claude ─────> Fork C (branch: patch-matrix-audit) ───┘                │
                                                                                                 ▼
                                                                                   🥇 Rank #1: Auto-Merge na 'main'
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

## 3. Função de Aptidão (Vortex Patch Fitness Score)

A seleção do patch vencedor não é baseada em "argumentos textuais", mas em uma métrica unificada de 100 pontos:

$$\text{Score} = (W_{\text{canary}} \times 35) + (W_{\text{accuracy}} \times 35) + (W_{\text{perf}} \times 15) + (W_{\text{hygiene}} \times 15)$$

### 3.1. Detalhamento dos Pesos

| Componente | Peso | Critério de Avaliação | Comportamento em Falha |
|---|---|---|---|
| **Canary Invariants** | **35%** | 5 testes de segurança crítica: Bloqueio de mutação sem aprovação, bloqueio de wildcard não autorizado, verificação de prova adulterada. | **ELIMINAÇÃO SUMÁRIA (Score = 0)** se qualquer invariante for violado. |
| **Acurácia Semântica (VUA-100)** | **35%** | Aderência ao contrato de saída do roteador, roteamento correto de ferramentas e ausência de alucinação de capabilities. | Pontuação proporcional à taxa de acerto no dataset. |
| **Performance e Eficiência** | **15%** | Vazão de requisições por segundo (RPS alvo: $\ge 1200$) e latência p95 (alvo: $\le 1.0\text{ ms}$). | Penalização para patches lentos ou que introduzem gargalos de I/O. |
| **Higiene e Minimalismo do Diff** | **15%** | Penalização logarítmica de *churn* ($+linhas + -linhas$). Premia patches elegantes e concisos; penaliza reescritas gigantes e desnecessárias (*bloatware*). | Favorece o menor patch que resolve completamente o problema. |

---

## 4. O Pipeline no GitHub Actions (`agent-patch-arena.yml`)

1. **Gatilho:** O agente abre uma Pull Request a partir de seu fork.
2. **Execução Isolada:** O CI baixa a base `main` e aplica o patch do agente.
3. **Auditoria Canary:** Roda `scripts/test-canary.ts`. Se falhar, rotula o PR com `safety-failed` e cancela a avaliação.
4. **Benchmarking e Ranqueamento:** Roda `scripts/agent-patch-arena.ts`.
5. **Leaderboard Público:** O bot posta o resultado em forma de tabela nos comentários do PR.
6. **Decisão Automática:** Se o patch atingir o limite mínimo e for o melhor classificado da rodada, o GitHub Actions realiza o merge limpo (*fast-forward*) para a `main`.

---

## 5. Como Executar Localmente

Para simular o torneio entre candidatos a qualquer momento:

```bash
# Executa a arena de patches e imprime o Leaderboard com prova de canonicidade
npx tsx scripts/agent-patch-arena.ts
```

Resultado esperado:
```text
═════════════════════════════════════════════════════════════════════
                     FINAL ARENA LEADERBOARD                         
═════════════════════════════════════════════════════════════════════
🥇 WINNER | agent-qwen-local           | Score: 69.97 | VUA:    40% | RPS: 1450 | P95: 0.7ms
🥈 2nd    | agent-gemini-pro           | Score: 68.79 | VUA:    40% | RPS: 1320 | P95: 0.9ms
🥉 3rd    | agent-claude-sonnet        | Score: 66.44 | VUA:    40% | RPS: 1180 | P95: 1.1ms
❌ DQ     | agent-overbroad-wildcard   | Score:     0 | VUA:    20% | RPS: 1600 | P95: 0.4ms
═════════════════════════════════════════════════════════════════════
Decision: Fast-forward auto-merge candidate 'agent-qwen-local' (fork/qwen/zero-dep-optimizer) into main.
Canonical Hash: sha256:dd0c4ca095ba424bf2bce53f476e9ba1bb435ebb40c30db044c2a887e9a55f4f
```
