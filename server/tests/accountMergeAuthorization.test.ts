import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasAccountMergeOperatorContext, hasRealAccountMergeActor } from '../accountMergeAuthorization';

test('global search remains support-only while real commissioners may use the league-authorized path', () => {
  assert.equal(hasRealAccountMergeActor({
    user: { claims: { sub: 'commissioner-id' } }, realActor: { id: 'commissioner-id' },
  }), true);
  assert.equal(hasRealAccountMergeActor({
    user: { claims: { sub: 'commissioner-id' } }, realActor: { id: 'someone-else' },
  }), false);
  assert.equal(hasRealAccountMergeActor({
    demoContext: {}, user: { claims: { sub: 'commissioner-id' } }, realActor: { id: 'commissioner-id' },
  }), false);
  assert.equal(hasAccountMergeOperatorContext({
    user: { claims: { email: 'commissioner@example.test', sub: 'commissioner-id' } },
    realActor: { id: 'commissioner-id' },
  }), false);
  assert.equal(hasAccountMergeOperatorContext({
    user: { claims: { email: 'tobin@rosterhockey.com', sub: 'support-id' } },
    realActor: { id: 'other-id' },
  }), false);
  assert.equal(hasAccountMergeOperatorContext({
    demoContext: { id: 'demo' },
    user: { claims: { email: 'tobin@rosterhockey.com', sub: 'support-id' } },
    realActor: { id: 'support-id' },
  }), false);
  assert.equal(hasAccountMergeOperatorContext({
    user: { claims: { email: 'tobin@rosterhockey.com', sub: 'support-id' } },
    realActor: { id: 'support-id' },
  }), true);
});