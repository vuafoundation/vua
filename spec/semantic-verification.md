# VUA Semantic Verification & Capability Routing Specification v0.1

> Status: draft normative specification
> Date: 2026-09-09
> Companion: Vortex Invocation Contract v0.3

## 1. Purpose

VUA is the capability-selection and adapter layer between an agent/LLM and governed execution. VUA MUST NOT treat an LLM response as proof of correctness.

The central rule is:

```text
LLM inference ≠ deterministic verification
ExecutionProof ≠ semantic truth
```

When a task class has a deterministic, specialized, schema, test, compiler, or domain-rule verifier, VUA SHOULD route the candidate result through that capability before a higher-level correctness claim is emitted.

## 2. Architecture

```text
AGENT / LLM
     │
     ▼
 candidate / intent
     │
     ▼
 VUA CAPABILITY ROUTER
     │
     ├── math / units
     ├── schema validation
     ├── OCR
     ├── object detection
     ├── metrology
     ├── compiler / tests
     └── domain rules
     │
     ▼
 VORTEX GATEWAY
     │
     ├── identity
     ├── authorization
     ├── policy
     ├── scope
     └── execution limits
     │
     ▼
 ADAPTER / RUNTIME
     │
     ▼
 evidence
     │
     ▼
 independent verification
```

## 3. Capability descriptor

A verifier capability SHOULD expose a descriptor equivalent to:

```json
{
  "capability_id": "verify.math.v1",
  "kind": "deterministic",
  "input_types": ["numeric_expression", "word_problem"],
  "output_type": "verification_result",
  "deterministic": true,
  "side_effect": false,
  "version": "1.0.0",
  "authority": "vua",
  "proof_required": true
}
```

Capabilities MUST declare whether they are deterministic, side-effecting, externally dependent, or probabilistic.

## 4. Verification result

```json
{
  "verification_status": "PASS | FAIL | NOT_PROVABLE",
  "semantic_verified": true,
  "capability_id": "verify.math.v1",
  "check_id": "sha256:...",
  "input_hash": "sha256:...",
  "output_hash": "sha256:...",
  "reason": "string",
  "deterministic": true
}
```

`PASS` means the declared verifier accepted the candidate under its contract. It does not grant authority beyond the declared capability.

`FAIL` means the candidate violated the verifier's contract.

`NOT_PROVABLE` means no suitable verifier was available or the evidence was insufficient. It MUST NOT be rewritten as `PASS` merely because the LLM was confident.

## 5. Routing policy

VUA SHOULD classify the task before selecting a verifier:

| Task | Preferred verifier |
|---|---|
| arithmetic | deterministic math engine |
| unit conversion | deterministic conversion engine |
| JSON/API shape | schema validator |
| source code | compiler + tests |
| image text | OCR |
| object location/count | object detection |
| physical dimension | metrology/vision + deterministic conversion |
| domain safety rule | domain rule engine |
| open-ended explanation | semantic verification may be unavailable |

The LLM may remain responsible for interpretation and explanation, but it MUST NOT silently replace a required specialized verifier.

## 6. Measurement rule

For physical measurements, perception and calculation are separate stages:

```text
image
 ↓
measurement_candidate
 ↓
deterministic conversion
 ↓
unit normalization
 ↓
range / consistency checks
 ↓
verification result
```

Example:

```text
28 mm / 25.4 = 1.102362... in
```

A perception result of `28 mm` cannot be silently converted to `1 in`. The conversion engine must preserve the actual value and any rounding policy.

## 7. Logic/math rule

Example:

```text
17 sheep
all except 9 die
```

The candidate `8` is executable output but fails the deterministic semantic check. The correct pipeline is:

```text
LLM → 8
 ↓
verify.math.v1
 ↓
FAIL
 ↓
semantic_verified=false
```

VUA MUST preserve the original candidate and verifier evidence for auditability.

## 8. Security boundary

Authorization MUST precede any adapter side-effect:

```text
REQUEST
 ↓
VUA capability selection
 ↓
VORTEX identity
 ↓
authorization
 ↓
policy / scope / limits
 ↓
ALLOW
 ↓
adapter execution
```

An adapter MUST NOT self-assert unrestricted principal or wildcard authority. Authority belongs to the governed request/policy context.

## 9. Proof boundary

VUA and Vortex MUST distinguish:

- `execution_verified`: execution/evidence chain passed its integrity checks;
- `evidence_integrity_verified`: hashes/signatures/canonicalization passed;
- `semantic_verified`: an applicable verifier passed;
- `side_effect_verified`: an external effect has independently verifiable evidence.

These claims are independent. A valid Ed25519 signature or SHA-256 digest MUST NOT be interpreted as semantic correctness.

## 10. Benchmark boundary

Benchmark records MUST identify the measured window:

```json
{
  "wall_duration_ms": 41460,
  "governed_execution_duration_ms": 17,
  "provider_duration_ms": 41400
}
```

Values are illustrative. Implementations MUST record only measured values.

A benchmark comparing different measurement windows is invalid unless the difference is explicitly normalized.

## 11. Conformance tests

A conforming VUA implementation MUST test at least:

1. deterministic arithmetic verification;
2. unit conversion precision;
3. semantic rejection of an incorrect but successfully executed LLM answer;
4. `NOT_PROVABLE` when no verifier exists;
5. schema validation;
6. verifier identity/version tracking;
7. authorization before adapter side-effect;
8. preservation of candidate output and verification evidence;
9. separation of wall-clock and governed execution latency;
10. proof integrity independent from semantic correctness.

## 12. Relationship with Vortex

```text
VUA = capability discovery + routing + adapter execution
Vortex = authority + policy + bounded execution + evidence + independent verification
```

VUA does not replace Vortex governance. Vortex does not need to know the implementation details of every specialized capability, but it MUST govern the capability invocation and its proof boundary.

## 13. Maturity gate

The following claim is prohibited until the corresponding evidence exists:

```text
EXECUTION_SUCCESS
      ≠
SEMANTIC_VERIFIED
```

The target maturity path is:

```text
M0 capability exists
 ↓
M1 capability contract + tests
 ↓
M2 real execution
 ↓
M3 independent verification
 ↓
M4 proof + benchmark evidence
 ↓
M5 CI/conformance + promotion
```
