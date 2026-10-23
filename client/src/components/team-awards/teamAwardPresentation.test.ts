import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getAwardHolderLabel } from './teamAwardPresentation';

describe('getAwardHolderLabel', () => {
  it('names the current holder', () => {
    assert.equal(getAwardHolderLabel('Mira Chen'), 'Held by Mira Chen');
  });
  it('uses the contract-facing unassigned wording when there is no holder', () => {
    assert.equal(getAwardHolderLabel(null), 'Unassigned');
    assert.equal(getAwardHolderLabel(undefined), 'Unassigned');
  });
});
