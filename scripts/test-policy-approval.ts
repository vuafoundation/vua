import assert from 'node:assert/strict';
import { evaluatePolicy } from '../src/vortex/policy.js';
import type { AuthorizationContext } from '../src/vortex/types.js';

const auth: AuthorizationContext = {
  capability: 'repository.write',
  principal_id: 'test',
  agent_id: 'test',
  policy_id: 'vortex-development',
  policy_version: '1.0.0',
  scope: { repositories: ['scoobiii/vortex'], branches: ['fix/*'], paths: ['src/*'] },
};
const target = { repository: 'scoobiii/vortex', branch: 'fix/security', path: 'src/index.ts' };

const arbitraryPrefixed = evaluatePolicy('branch.write', target, auth, 'approval-attacker-controlled');
assert.equal(arbitraryPrefixed.allowed, false, 'arbitrary approval-prefixed tokens must be rejected');
assert.equal(arbitraryPrefixed.requires_approval, true);

const valid = evaluatePolicy('branch.write', target, auth, 'vortex-approved-human');
assert.equal(valid.allowed, true, 'the configured regression token must remain accepted');
assert.equal(valid.is_approved, true);

console.log('Policy approval regression suite: PASS');
