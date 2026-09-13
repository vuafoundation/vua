# Auditoria 2 de Cabeçalhos GOS3

## Escopo

A Auditoria 2 verifica os contratos GOS3 monitorados pelo VUA e compara o resultado com a Auditoria 1 definida pelo estado `origin/main`. A análise cobre presença de cabeçalho, versão, recurso, capacidade, checksum SHA-256 e igualdade entre os arquivos governados das duas referências.

O auditor não acessa o Android, o GitHub por API, credenciais ou serviços externos. Ele analisa somente os arquivos fornecidos no diretório do repositório ou em snapshots exportados.

## Resultado atual

| Indicador | Auditoria 1 (`origin/main`) | Auditoria 2 (snapshot atual) |
|---|---:|---:|
| Arquivos GOS3 monitorados | 2 | 2 |
| Contratos válidos | 2 | 2 |
| Contratos com falha | 0 | 0 |
| Arquivos governados alterados | — | 0 |
| Resultado | PASS | PASS |

Os dois arquivos permaneceram inalterados e válidos:

| Arquivo | Versão | Capacidade | Checksum |
|---|---:|---|---|
| `src/governed/governed-vault.ts` | 1.0.0 | `repository.write` | `sha256:24809582b25160572ce1d140cd09fb5a0bafad2005258ba41414e02737de48b5` |
| `scripts/verify-gos3-provenance.mjs` | 1.0.0 | `system.inspect` | `sha256:a18025ca7ea67041672ee94a9d9c828344ab6eb3d94beb65a11dffd1ab1570da` |

A conclusão é limitada ao escopo de cabeçalhos e checksums. O resultado não prova que os fluxos Android, OAuth, Firebase, MCP ou conectores externos estejam funcionando em produção.

## Execução local com Git

No diretório do repositório:

```bash
python3 scripts/audit-gos3-headers.py \
  --repo . \
  --baseline-ref origin/main \
  --json-out reports/gos3-audit-2.json
```

O código de saída é `0` quando todos os contratos do snapshot atual são válidos. O código é `1` quando existe cabeçalho ausente, malformado, ilegível ou com checksum divergente.

Para repetir a verificação normativa existente:

```bash
npm run verify:gos3 -- --strict
```

## Execução sem Git, incluindo Google AI Studio

O script usa somente a biblioteca padrão do Python. Para executar em um ambiente Python remoto, como o Code Execution disponível em ferramentas compatíveis com o Google AI Studio, envie duas pastas descompactadas: `snapshot-1` para a Auditoria 1 e `snapshot-2` para a Auditoria 2.

```bash
python3 scripts/audit-gos3-headers.py \
  --repo ./snapshot-2 \
  --baseline-dir ./snapshot-1 \
  --json-out ./gos3-audit-2.json
```

O ambiente remoto deve receber apenas código e documentação necessários à auditoria. Não envie `.env`, tokens, chaves privadas, certificados, APKs, `node_modules`, artefatos pessoais ou arquivos não relacionados ao repositório.

## Interpretação

`VALID` significa que o cabeçalho contém versão e checksum e que o checksum calculado sobre o conteúdo sem o bloco GOS3 coincide com o valor declarado. `TAMPERED` significa divergência entre o checksum declarado e o conteúdo atual. `MALFORMED` significa que o cabeçalho existe, mas não contém os campos mínimos. `MISSING_HEADER` significa que o arquivo foi identificado como governado, mas não possui o bloco GOS3.

A comparação `UNCHANGED` significa que os metadados auditados, incluindo checksum, são iguais entre as duas referências. Ela não significa que todos os arquivos do repositório sejam iguais.

## Próximo sprint

O próximo sprint recomendado é **PEVC-02 — Rastreabilidade requisito–teste–evidência**. O foco deve ser associar cada cabeçalho GOS3 e cada invariável de execução a um teste automatizado, uma evidência JSON e um commit específico, sem ampliar o escopo para novos adaptadores antes de completar essa rastreabilidade.

## Referências

[1]: https://www.rfc-editor.org/rfc/rfc8785 "JSON Canonicalization Scheme — RFC 8785"
[2]: https://slsa.dev/spec/v1.0/ "SLSA Provenance Specification"
