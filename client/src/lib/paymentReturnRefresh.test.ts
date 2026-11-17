import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getCardPaymentStateKey, subscribeToPaymentResume } from './paymentReturnRefresh';

class TestDocument extends EventTarget {
  visibilityState = 'visible';
}
const wait = () => new Promise(resolve => setTimeout(resolve, 30));

test('foreground signals coalesce into one refresh without refreshing on subscription', async () => {
  const win = new EventTarget(), doc = new TestDocument();
  let calls = 0;
  const stop = subscribeToPaymentResume(win, doc, () => { calls++; }, 5);
  assert.equal(calls, 0);
  win.dispatchEvent(new Event('focus'));
  win.dispatchEvent(new Event('pageshow'));
  doc.dispatchEvent(new Event('visibilitychange'));
  await wait();
  assert.equal(calls, 1);
  win.dispatchEvent(new Event('focus'));
  await wait();
  assert.equal(calls, 2);
  stop();
});

test('background signals and a page hidden before its timer fires never refresh', async () => {
  const win = new EventTarget(), doc = new TestDocument();
  let calls = 0;
  const stop = subscribeToPaymentResume(win, doc, () => { calls++; }, 5);
  doc.visibilityState = 'hidden';
  win.dispatchEvent(new Event('focus'));
  doc.dispatchEvent(new Event('visibilitychange'));
  await wait();
  assert.equal(calls, 0);
  doc.visibilityState = 'visible';
  win.dispatchEvent(new Event('focus'));
  doc.visibilityState = 'hidden';
  await wait();
  assert.equal(calls, 0);
  doc.visibilityState = 'visible';
  doc.dispatchEvent(new Event('visibilitychange'));
  await wait();
  assert.equal(calls, 1);
  stop();
});

test('unmount or scope cleanup cancels queued refresh and removes all listeners', async () => {
  const win = new EventTarget(), doc = new TestDocument();
  let calls = 0;
  const stop = subscribeToPaymentResume(win, doc, () => { calls++; }, 5);
  win.dispatchEvent(new Event('focus'));
  stop();
  win.dispatchEvent(new Event('focus'));
  win.dispatchEvent(new Event('pageshow'));
  doc.dispatchEvent(new Event('visibilitychange'));
  await wait();
  assert.equal(calls, 0);
});

test('card snapshots ignore poll ordering and non-payment fields', () => {
  const a = { id: 'a', status: 'paid', receiptUrl: 'old' };
  const b = { id: 'b', status: 'refunded', refundedAmountCents: 2000 };
  assert.equal(getCardPaymentStateKey([a, b]), getCardPaymentStateKey([b, { ...a, receiptUrl: 'new' }]));
});

test('settlement, refund, dispute, ownership and attempt changes produce new snapshots', () => {
  const original = {
    id: 'a', recipientId: 'recipient', payerUserId: 'payer',
    status: 'processing', refundedAmountCents: 0, disputeStatus: null,
  };
  const key = getCardPaymentStateKey([original]);
  for (const change of [
    { status: 'paid' }, { status: 'failed' }, { status: 'refund_pending' },
    { status: 'refunded' }, { status: 'disputed' }, { refundedAmountCents: 2000 },
    { disputeStatus: 'lost' }, { disputeStatus: 'won' }, { payerUserId: 'new-payer' },
    { recipientId: 'replacement' }, { id: 'new-attempt' },
  ]) assert.notEqual(getCardPaymentStateKey([{ ...original, ...change }]), key);
  assert.notEqual(getCardPaymentStateKey([]), key);
  assert.notEqual(getCardPaymentStateKey([original, { ...original, id: 'b' }]), key);
});
