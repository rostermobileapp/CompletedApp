import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasAccountMergeOperatorContext } from '../accountMergeAuthorization';

test('a league commissioner cannot open account-wide merge without support authorization', () => {
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