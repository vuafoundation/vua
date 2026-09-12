# MCP no Termux com Alpine `proot-distro`

Este documento descreve como executar o VUA dentro do Alpine Linux no
Termux, testar o endpoint MCP HTTP e verificar `ExecutionProof`.

## Arquitetura

```text
Termux
└── Alpine Linux via proot-distro
    └── ~/vua
        └── servidor MCP em 127.0.0.1:3000/mcp
```

O servidor deve escutar em:

```text
http://127.0.0.1:3000/mcp
```

O endereço `127.0.0.1` é acessível pelo próprio ambiente Alpine. Para
acessar o servidor a partir de outro dispositivo, não exponha a porta
diretamente sem autenticação, autorização e TLS.

## Instalação no Termux

No Termux:

```sh
pkg update
pkg upgrade
pkg install git curl jq proot-distro nodejs-lts
```

Caso o Alpine ainda não esteja instalado:

```sh
proot-distro install alpine
```

Entre no ambiente Alpine usando `/tmp` compartilhado:

```sh
proot-distro login alpine --shared-tmp
```

## Dependências no Alpine

Dentro do Alpine:

```sh
apk update
apk add bash curl git jq nodejs npm
```

Se o projeto ainda não existir:

```sh
cd ~
git clone <URL_DO_REPOSITORIO> vua
cd vua
```

Se o projeto já estiver instalado:

```sh
cd ~/vua
git status
```

Instale as dependências Node:

```sh
npm ci
```

Antes de iniciar, confira os comandos disponíveis:

```sh
npm run
```

Use o script de desenvolvimento ou de produção definido pelo projeto,
por exemplo:

```sh
npm run dev
```

O servidor deverá informar que está escutando em `127.0.0.1:3000`.

## Teste básico de conectividade

Em outra sessão Alpine, ou após iniciar o servidor em background:

```sh
curl -sS http://127.0.0.1:3000/mcp
```

Uma resposta HTTP de erro JSON-RPC ainda indica que a porta está
acessível. O objetivo deste comando é somente verificar conectividade.

## Inicialização MCP

O cliente deve enviar uma mensagem JSON-RPC `initialize`:

```sh
curl -sS -X POST http://127.0.0.1:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2024-11-05",
      "capabilities": {},
      "clientInfo": {
        "name": "manual-test",
        "version": "1.0.0"
      }
    }
  }' | jq .
```

Resposta esperada:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "tools": {
        "listChanged": false
      }
    }
  }
}
```

## Listar ferramentas

```sh
curl -sS -X POST http://127.0.0.1:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list",
    "params": {}
  }' | jq .
```

As ferramentas principais são:

- `vortex.inspect`
- `vortex.propose`
- `vortex.verify`
- `vortex.execute`
- `vortex.branch.write`
- `vortex.llm.invoke`
- `vua.adapters.list`
- `vua.adapter.invoke`

## Executar `vortex.inspect`

```sh
curl -sS -X POST http://127.0.0.1:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "vortex.inspect",
      "arguments": {
        "request_id": "manual-inspect-001",
        "input": {}
      }
    }
  }' | tee /tmp/inspect.json | jq .
```

O resultado deve conter:

```text
result.execution_proof
```

Salve somente o objeto `execution_proof`:

```sh
jq '.result.execution_proof' /tmp/inspect.json > /tmp/execution-proof.json
```

Confira os campos principais:

```sh
jq '{
  proof_version,
  request_id,
  execution_id,
  status,
  input_hash,
  output_hash,
  signature,
  proof_hash
}' /tmp/execution-proof.json
```

## Verificar o `ExecutionProof`

Não use placeholders como `<COLE_AQUI>` dentro do JSON. O caractere `<`
não faz parte da sintaxe JSON.

A maneira mais segura é inserir o proof salvo usando `jq`:

```sh
jq -n \
  --arg request_id "manual-verify-001" \
  --slurpfile proof /tmp/execution-proof.json \
  '{
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "vortex.verify",
      arguments: {
        request_id: $request_id,
        input: {
          execution_proof: $proof[0]
        }
      }
    }
  }' |
curl -sS -X POST http://127.0.0.1:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  --data-binary @- | jq .
```

Para um proof íntegro, a resposta esperada é:

```json
{
  "verified": true,
  "verification_scope": "full",
  "tamper_evident": true,
  "rfc8785_canonical": true
}
```

## Teste de adulteração

Crie uma cópia com o `output_hash` alterado:

```sh
jq '.output_hash = "sha256:" + ("0" * 64)' \
  /tmp/execution-proof.json > /tmp/tampered-proof.json
```

Envie o proof adulterado:

```sh
jq -n \
  --arg request_id "manual-verify-tampered-001" \
  --slurpfile proof /tmp/tampered-proof.json \
  '{
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: {
      name: "vortex.verify",
      arguments: {
        request_id: $request_id,
        input: {
          execution_proof: $proof[0]
        }
      }
    }
  }' |
curl -sS -X POST http://127.0.0.1:3000/mcp \
