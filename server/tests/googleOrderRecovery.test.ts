import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { matchesGooglePlayCustomer } from '../googleIap';

const customer = '$RCAnonymousID:41dedea94486443a9242902ecf5424d1';
const binding = createHash('sha256').update(customer).digest('base64');

test('anonymous RevenueCat identity matches the account binding Google recorded', () => {
  assert.equal(matchesGooglePlayCustomer(customer, binding), true);
});

test('order ID alone, a different device, and malformed identities cannot claim a purchase', () => {
  assert.equal(matchesGooglePlayCustomer(customer, undefined), false);
  assert.equal(matchesGooglePlayCustomer('$RCAnonymousID:differentcustomer0000000000000000', binding), false);
  assert.equal(matchesGooglePlayCustomer('GPA.3376-1900-5718-15142', binding), false);
  assert.equal(matchesGooglePlayCustomer('', binding), false);
  assert.equal(matchesGooglePlayCustomer(customer, 'bad-base64'), false);
});