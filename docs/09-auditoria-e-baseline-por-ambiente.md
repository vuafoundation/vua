# Auditoria, baseline e verdade operacional

## O que o gate prova

O VUA separa quatro estados: **documentado**, **implementado**, **executado** e **verificado**. O quality gate verifica a suíte executada, os invariantes adversariais, a integridade da prova, a cobertura declarada e o benchmark observado. O hash de evidência identifica o conteúdo produzido para aquela execução.

Isso não autoriza afirmar que todos os adapters foram executados end-to-end, que o endpoint `/mcp` está seguro em qualquer deployment ou que a assinatura da prova equivale a uma prova de segurança. A regra permanece: **proof of execution is not proof of safety**.

## Baseline por ambiente

O benchmark calcula um fingerprint determinístico com arquitetura, modelo de CPU e versão do Node. O fingerprint aparece como `environment_fingerprint.sha256` no relatório. Um arquivo de baseline pode ser fornecido por `VORTEX_BASELINE_FILE`:

```json
{
  "sha256:...": {
    "rps": 850,
    "p50_ms": 1.2,
    "p95_ms": 4.8,
    "p99_ms": 12.5,
    "error_rate_pct": 0,
    "timeout_rate_pct": 0,
    "memory_efficiency_pct": 95
  }
}
```

Se o fingerprint não existir, o sistema usa o baseline normativo e marca `baseline_source: normative-default`. A tolerância é configurada por `BASELINE_TOLERANCE`, com padrão `1.0` e mínimo `1.0`. A tolerância apenas define o limite de aceitabilidade; ela não altera as métricas nem fabrica superioridade.

## Execução

```bash
BASELINE_TOLERANCE=1.0 npm test
npm run verify:gos3
```

Para gerar um baseline de hardware específico, execute várias amostras no mesmo ambiente controlado, revise os valores e grave o arquivo somente após revisão humana. O arquivo deve ser versionado junto com a justificativa, o commit e o ambiente que o originou.

## Gaps ainda abertos

A implementação ainda precisa de um verificador independente em Go ou Rust, descoberta pública de chaves (`/.well-known/vortex-keys`), formalização da especificação em formato RFC-like, exercício end-to-end de Android/Windows/GitHub e validação real do `/mcp` em cada deployment. Esses itens não devem ser promovidos a claims de produção apenas porque os gates locais estão verdes.
