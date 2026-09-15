/**
 * @gos3-contract
 * @version 1.0.0
 * @resource src/vortex/ci-env.ts
 * @checksum sha256:7d2eede96c0cf743fcc06fad59b0ee389fbf2a6bd8b1f7cac1cec7f5e32e0865
 * @capability repository.write
 * @onboarded_at 2026-09-13T00:00:00.000Z
 * @governed true
 */
import { execSync } from "node:child_process";

export function resolveCommitSha(): string {
  if (process.env.VUA_COMMIT_SHA) return process.env.VUA_COMMIT_SHA;
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execSync("git rev-parse HEAD").toString().trim();
  } catch {
    throw new Error("CI_PROVENANCE_MISSING: no VUA_COMMIT_SHA, GITHUB_SHA, or git HEAD");
  }
}

export function resolveCiRunId(): string {
  if (process.env.GITHUB_RUN_ID) return process.env.GITHUB_RUN_ID;
  if (process.env.VUA_CI_RUN_ID) return process.env.VUA_CI_RUN_ID;
  return `local-${Date.now()}`;
}

export function resolveCiRunAttempt(): string {
  return process.env.GITHUB_RUN_ATTEMPT ?? process.env.VUA_CI_RUN_ATTEMPT ?? "1";
}
