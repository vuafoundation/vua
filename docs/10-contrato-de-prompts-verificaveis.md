# Contrato de Prompts Verificáveis

## 1. Objetivo

Este contrato define como escrever prompts para tarefas de engenharia no VUA. O formato foi desenhado para que outra pessoa ou agente consiga executar a tarefa sem depender de contexto implícito e para que o resultado possa ser avaliado por comandos reproduzíveis.

Um prompt compatível com este contrato não é apenas uma instrução de implementação. Ele é uma especificação operacional curta, com limites, invariantes e método de verificação.

## 2. Campos obrigatórios

| Campo | Obrigatório | Conteúdo |
|---|---|---|
| `title` | Sim | Nome curto da mudança |
| `objective` | Sim | Resultado observável desejado |
| `context` | Sim | Estado atual e arquivos relevantes |
| `scope` | Sim | O que pode ser alterado |
| `non_goals` | Sim | O que não deve ser alterado |
| `threats` | Sim | Abusos, regressões ou falhas a evitar |
| `invariants` | Sim | Propriedades que devem continuar verdadeiras |
| `acceptance` | Sim | Critérios verificáveis de aceite |
| `verification` | Sim | Comandos e inspeções a executar |
| `deliverables` | Sim | Arquivos, testes ou documentação esperados |
| `output_format` | Sim | Estrutura da resposta final |

## 3. Modelo reutilizável

```yaml
title: "Título curto e específico"
objective: >
  Descrever o comportamento observável que deve existir ao final.
context:
  repository: "vuafoundation/vua"
  base_branch: "main"
  relevant_files:
    - "server.ts"
    - "src/vortex/policy.ts"
  current_behavior: >
    Descrever o comportamento atual com fatos verificáveis.
scope:
  allowed_files:
    - "src/vortex/policy.ts"
    - "scripts/test-policy-approval.ts"
  allowed_operations:
    - "alterar a decisão de política"
    - "adicionar regressão automatizada"
non_goals:
  - "não migrar o framework HTTP"
  - "não alterar o modelo de identidade"
threats:
  - id: "T1"
    description: "Descrever o abuso ou regressão"
    expected_control: "Descrever o controle que deve impedir o problema"
invariants:
  - id: "I1"
    statement: "Uma rejeição de política não inicia o conector"
  - id: "I2"
    statement: "Autenticação não equivale a aprovação humana"
acceptance:
  - id: "A1"
    requirement: "Token arbitrário de aprovação é rejeitado"
    check: "npm run test:policy-approval"
    expected: "exit 0 e caso negativo aprovado"
  - id: "A2"
    requirement: "O projeto compila sem erro de tipos"
    check: "npm run lint"
    expected: "exit 0"
verification:
  commands:
    - "npm ci"
    - "npm run lint"
    - "npm test"
    - "npm run build"
  manual_checks:
    - "inspecionar git diff --check"
    - "confirmar ausência de segredo na evidência"
deliverables:
  - "código implementado"
  - "teste de regressão"
  - "matriz de rastreabilidade atualizada"
output_format:
  sections:
    - "Resumo da mudança"
    - "Arquivos alterados"
    - "Verificações executadas"
    - "Resultados"
    - "Limitações"
    - "Riscos remanescentes"
```

## 4. Regras de escrita

O campo `objective` deve descrever um resultado observável. “Melhorar a segurança” é insuficiente. “Rejeitar um token de aprovação que não esteja vinculado a uma aprovação persistida, sem iniciar o conector” é observável.

O campo `context` deve distinguir fatos do estado atual de hipóteses. Referências a arquivos, funções, comandos e testes devem ser reais. Se uma informação não foi verificada, ela deve ser marcada como hipótese.

O campo `scope` deve listar os arquivos e operações permitidos. Qualquer alteração fora do escopo deve exigir revisão do prompt ou um novo PR.

O campo `non_goals` deve impedir expansão silenciosa. Ele é obrigatório mesmo quando a tarefa parece pequena.

O campo `threats` deve descrever como a mudança poderia falhar ou ser abusada. Para mudanças de segurança, deve haver pelo menos um abuso negativo e um controle esperado.

O campo `invariants` deve usar frases testáveis. Cada invariável precisa estar ligada a um teste, uma inspeção ou uma propriedade formal.

O campo `acceptance` deve conter critérios binários sempre que possível. Um critério como “a implementação parece correta” não é aceito.

O campo `verification` deve conter comandos completos e não ambíguos. O prompt não pode exigir “rodar os testes” sem especificar quais testes.

## 5. Regras para respostas de execução

A resposta final de quem executa o prompt deve seguir esta estrutura:

```text
## Resumo da mudança

## Arquivos alterados

## Critérios de aceite
| ID | Critério | Comando ou inspeção | Resultado |

## Verificações executadas
| Comando | Exit code | Resultado |

## Evidência
- commit avaliado:
- ambiente:
- artefatos:
- hashes, quando aplicável:

## Limitações

## Riscos remanescentes
```

A resposta deve declarar o código de saída de cada comando relevante. Uma execução interrompida, uma falha ignorada ou um teste não executado não pode ser descrito como sucesso.

## 6. Proibição de evidência inventada

O executor não deve afirmar que um teste passou sem ter executado o comando correspondente. Também não deve afirmar que uma vulnerabilidade foi eliminada somente porque o código parece correto.

Quando a execução não for possível, usar explicitamente um dos estados abaixo:

- `VERIFIED`: comando executado e critério atendido;
- `FAILED`: comando executado e critério não atendido;
- `NOT_RUN`: comando não executado;
- `NOT_APPLICABLE`: critério não se aplica, com justificativa;
- `BLOCKED`: execução impedida por dependência, permissão ou ambiente.

## 7. Requisitos para mudanças de segurança

Uma mudança que afeta autenticação, autorização, aprovação, sandbox, credenciais ou provas deve incluir:

1. um caso de abuso que falha fechado;
2. um caso permitido que continua funcionando;
3. uma verificação de que o conector não foi iniciado quando a política nega;
4. uma verificação de que a identidade e o escopo corretos chegam à execução;
5. uma inspeção para confirmar que tokens e segredos não foram adicionados à evidência;
6. uma descrição de limitações e suposições de implantação.

## 8. Critérios de revisão humana

O revisor deve responder afirmativamente às seguintes perguntas:

- O objetivo é observável?
- O escopo está limitado?
- Os não-objetivos impedem expansão silenciosa?
- Cada ameaça tem um controle?
- Cada critério de aceite possui verificação?
- Existe teste para sucesso e falha?
- A evidência corresponde ao commit revisado?
- A mudança preserva a separação entre autenticação, autorização, aprovação e execução?
- Os riscos remanescentes estão explícitos?

Se alguma resposta for negativa, o PR deve ser devolvido para revisão ou marcado como bloqueado.

## 9. Referências

[1]: https://csrc.nist.gov/publications/detail/ai/100-1/final "Artificial Intelligence Risk Management Framework — NIST"
[2]: https://slsa.dev/spec/v1.0/ "SLSA Provenance Specification"
