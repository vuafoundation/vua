# Sprint: Prompt Engineering e Código Verificável

## 1. Propósito

Este documento estabelece o primeiro sprint operacional para transformar requisitos escritos em prompts reproduzíveis, mudanças de código rastreáveis e evidências verificáveis no VUA. O sprint não pretende ampliar o número de adaptadores. Seu objetivo é reduzir ambiguidade, impedir alterações sem critérios de aceite e garantir que cada entrega possa ser reexecutada, testada e auditada.

> **Princípio:** nenhuma mudança de produto é considerada concluída apenas porque o código compila. Ela deve possuir intenção explícita, escopo limitado, critérios de aceite executáveis e evidência associada ao commit avaliado.

O sprint deve ser executado sobre um único fluxo de referência: **solicitação de ação governada, avaliação de política, execução controlada e emissão de prova**. O fluxo inclui tanto o servidor MCP quanto as camadas de política, sandbox, prova e verificação.

## 2. Resultado esperado

Ao final do sprint, o projeto deverá possuir um contrato documentado para prompts de engenharia, um formato mínimo para requisitos verificáveis, uma checklist uniforme para pull requests e uma matriz que relacione cada requisito a pelo menos um teste ou verificação automatizada.

O sprint não declara que o VUA está pronto para produção. Ele estabelece a disciplina necessária para que a evolução até um private beta seja mensurável e não dependa de interpretações individuais.

## 3. Duração e forma de trabalho

A duração sugerida é de **dez dias úteis**, com trabalho organizado em cinco etapas de dois dias. Cada etapa deve terminar com um artefato revisável. A equipe deve manter uma única mudança de intenção por pull request sempre que possível.

| Etapa | Dias | Resultado | Critério de saída |
|---|---:|---|---|
| E1 — Contrato | 1–2 | Prompt padrão, escopo e ameaça | Todo item possui objetivo, não-objetivos e risco explícitos |
| E2 — Especificação | 3–4 | Requisitos verificáveis e matriz de rastreabilidade | Cada requisito possui método de verificação |
| E3 — Implementação | 5–6 | Código e testes do fluxo escolhido | Código limitado ao escopo e testes reproduzíveis |
| E4 — Evidência | 7–8 | Artefato de execução e revisão | Checks, hashes, logs sanitizados e decisão registrados |
| E5 — Validação | 9–10 | PR revisado e relatório do sprint | Todos os gates passam ou possuem exceção formal |

## 4. Fluxo de trabalho obrigatório

Cada trabalho deve seguir a sequência abaixo.

### 4.1 Preparar a intenção

O autor deve registrar o problema, o resultado desejado, os limites da mudança e o risco principal. A descrição deve separar fatos conhecidos de hipóteses. Requisitos vagos como “melhorar segurança” não são suficientes.

### 4.2 Especificar o comportamento

O autor deve descrever o comportamento esperado para o caminho permitido, o caminho negado e os casos de erro. Quando a mudança envolver autorização, também deve especificar identidade, recurso, escopo, aprovação e validade temporal.

### 4.3 Implementar com escopo limitado

A alteração deve modificar somente os arquivos necessários para satisfazer o requisito. Refatorações não relacionadas devem ser separadas. O código deve evitar novos estados implícitos e deve preservar a distinção entre autenticação, autorização, aprovação e execução.

### 4.4 Verificar

A verificação deve incluir lint ou typecheck, testes unitários, testes adversariais relevantes, build e uma inspeção do diff. O comando executado, o commit avaliado e o resultado devem ser registrados no PR.

### 4.5 Revisar a evidência

A revisão deve responder se a evidência realmente demonstra o requisito. Um teste que apenas executa sem verificar o resultado não é suficiente. Para ações governadas, a evidência deve demonstrar também o estado `executed`, a decisão de política e a validade da prova.

## 5. Contrato de Prompt Engineering

Todo prompt de engenharia deve seguir o contrato em [`10-contrato-de-prompts-verificaveis.md`](./10-contrato-de-prompts-verificaveis.md). O contrato exige que o prompt contenha objetivo, contexto, escopo, invariantes, critérios de aceite, comandos de verificação e formato de saída.

O prompt deve instruir o executor a declarar incertezas e a não inventar evidência. Quando um requisito não puder ser verificado no ambiente disponível, a saída deve marcar o requisito como **não verificado**, e não como concluído.

## 6. Backlog do sprint

| ID | Entrega | Tipo | Dependências | Critério de aceite |
|---|---|---|---|---|
| PEVC-01 | Publicar o contrato de prompts verificáveis | Documento | Nenhuma | O contrato define campos obrigatórios, formato de saída e regra contra evidência inventada |
| PEVC-02 | Criar matriz requisito–teste–evidência | Documento | PEVC-01 | Cada requisito do fluxo de referência aponta para um comando ou teste |
| PEVC-03 | Padronizar checklist de PR | Processo | PEVC-01 | Um revisor consegue decidir se o PR é verificável sem conhecimento tácito |
| PEVC-04 | Exercitar o contrato em uma mudança de segurança | Código/teste | PEVC-01 | O exercício cobre autorização, aprovação e resultado executado |
| PEVC-05 | Publicar relatório de execução | Evidência | PEVC-02, PEVC-03 | O relatório contém commit, comandos, resultados e limitações |

## 7. Definição de pronto

Um item do sprint está pronto somente quando todas as condições aplicáveis abaixo forem atendidas:

- o requisito está escrito em linguagem observável;
- o escopo e os não-objetivos estão registrados;
- o risco e a superfície afetada foram identificados;
- o código possui teste ou verificação correspondente;
- o teste cobre pelo menos um caminho de sucesso e um caminho de falha quando aplicável;
- o diff foi revisado para detectar alterações fora do escopo;
- `npm run lint` passou;
- `npm test` passou ou a exceção foi registrada com justificativa;
- `npm run build` passou quando a mudança afeta runtime ou empacotamento;
- a dependência e o ambiente de execução foram registrados;
- nenhuma credencial, token ou segredo aparece na evidência;
- o resultado do teste está associado ao commit correto;
- limitações conhecidas estão declaradas no PR.

## 8. Matriz inicial de rastreabilidade

| Requisito | Implementação ou contrato | Verificação | Evidência mínima |
|---|---|---|---|
| Bearer não é aprovação humana | `server.ts`, `src/vortex/oauth.ts` | `npm run test:oauth` e teste de política | Status de autenticação separado de `approval_token` |
| Aprovação precisa ser explícita | `src/vortex/policy.ts` | `npm run test:policy-approval` | Token arbitrário negado e aprovação válida aceita |
| Rejeição não executa conector | `src/vortex/gateway.ts` e suíte adversarial | `npm test` | `executed: false` e status de rejeição |
| Prova não pode ser adulterada | `src/vortex/verifier.ts` | suíte adversarial e teste de tamper | Verificação inválida após alteração do payload |
| Escopo de sandbox é limitado | `src/vortex/sandbox.ts` | suíte de escape e path traversal | Caminho fora do escopo rejeitado |
| Build é reproduzível no lockfile | `package.json`, `package-lock.json` | `npm ci`, `npm run build` | Commit, versão Node e resultado do build |

A matriz deve ser atualizada no mesmo pull request que altera o requisito. Um requisito sem linha na matriz é considerado incompleto.

## 9. Gates do pull request

Os gates locais mínimos são:

```bash
npm ci
npm run lint
npm run test:oauth
npm run test:policy-approval
npm test
npm run build
git diff --check
```

O autor deve executar os comandos no commit final do branch. Se uma etapa não for aplicável, o PR deve explicar por que ela foi omitida. A omissão não pode ser ocultada por `|| true` ou por scripts que descartem o código de saída.

## 10. Métricas do sprint

O sprint deve medir qualidade do processo, não somente quantidade de linhas alteradas.

| Métrica | Meta inicial |
|---|---:|
| Requisitos com teste ou verificação associada | 100% |
| PRs com escopo e não-objetivos explícitos | 100% |
| PRs com comandos reproduzíveis | 100% |
| Falhas de CI não explicadas | 0 |
| Evidências contendo segredo | 0 |
| Requisitos declarados como concluídos sem teste | 0 |
| Testes críticos intermitentes | 0 conhecidos |

## 11. Riscos e limites

O contrato melhora a verificabilidade, mas não substitui revisão de arquitetura, modelagem de ameaça ou teste de intrusão. Uma suíte verde demonstra somente os comportamentos cobertos pela suíte. Ela não prova ausência geral de vulnerabilidades.

O sprint também não resolve, por si só, persistência distribuída, multi-tenancy, billing, observabilidade de produção ou operação multi-réplica. Esses itens permanecem no roadmap de maturidade do produto.

## 12. Responsabilidades

O autor da mudança é responsável por formular a intenção, limitar o escopo e produzir a evidência. O revisor é responsável por desafiar os critérios de aceite e verificar se os testes realmente demonstram o comportamento. O mantenedor é responsável por impedir que exceções temporárias sejam transformadas em padrão permanente.

## 13. Saída esperada do PR

O PR que encerra o sprint deve conter:

1. o contrato de prompts;
2. a matriz de rastreabilidade atualizada;
3. o checklist aplicado ao próprio PR;
4. os comandos executados no commit final;
5. os resultados e limitações conhecidos;
6. uma lista de itens transferidos para o próximo sprint.

O PR não deve ser mesclado com base apenas em texto declarativo. A aprovação deve considerar o diff, os testes e a evidência produzida.

## Referências

[1]: https://martinfowler.com/articles/practical-test-pyramid.html "The Practical Test Pyramid — Martin Fowler"
[2]: https://slsa.dev/spec/v1.0/ "SLSA Provenance Specification"
[3]: https://csrc.nist.gov/publications/detail/ai/100-1/final "Artificial Intelligence Risk Management Framework — NIST"
