# tools/scripts

Scripts one-shot usados durante a migração de baseline (PR #26) e correções
de CI. Não são runtime de produto.

- `auto_vua_git.py` — aplica patch de log drift + re-onboard GOS3 + commit/push
- `automate_gos3_baseline.py` — onboarding GOS3 em lote (formato TS vs Python por extensão)
- `fix_ci_caller.py` — migra caller de generateExecutionEvidence para commitSha/ciRunId reais
- `fix_ci_provenance.py` — remove defaults falsos de CI em generateExecutionEvidence
- `tolerance_fix.py` — liga VUA_BASELINE_TOLERANCE ao verdict de evaluateBenchmarkGate
