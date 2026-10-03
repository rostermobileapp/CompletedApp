import { createHash } from 'node:crypto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  claimAutomaticApplePurchaseWithClient,
  type AppleClaimQueryClient,
  type AutomaticAppleClaimInput,
} from '../appleAutomaticClaim';

type UserRow = {
  id: string;
  role: string;
  stripe_subscription_id: string | null;
  iap_original_transaction_id: string | null;
};
type LinkRow = {
  user_id: string;
  customer_id: string;
  original_transaction_id: string;
  product_id: string;
  original_purchased_at: Date;
  association_source: string;
};

class MockClaimClient implements AppleClaimQueryClient {
  users = new Map<string, UserRow>();
  links: LinkRow[] = [];
  inserted = 0;
  releasedLocks: string[] = [];
  googleClaims = new Set<string>();

  async query(text: string, values: unknown[] = []) {
    if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
      return { rows: [], rowCount: 0 };
    }
    if (text.includes('pg_advisory_xact_lock')) {
      this.releasedLocks.push(String(values[0]));
      return { rows: [], rowCount: 0 };
    }
    if (text.includes('SELECT id, role, stripe_subscription_id')) {
      const row = this.users.get(String(values[0]));
      return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (text.includes('SELECT id FROM users WHERE iap_original_transaction_id')) {
      const rows = [...this.users.values()]
        .filter(user => user.iap_original_transaction_id === values[0])
        .map(user => ({ id: user.id }));
      return { rows, rowCount: rows.length };
    }
    if (text.includes('SELECT user_id FROM google_iap_claims')) {
      const key = `${values[0]}:${values[1]}`;
      return { rows: this.googleClaims.has(key) ? [{ user_id: values[1] }] : [], rowCount: this.googleClaims.has(key) ? 1 : 0 };
    }
    if (text.includes('SELECT user_id, customer_id, original_transaction_id')) {
      const rows = this.links.filter(link =>
        link.user_id === values[0] ||
        link.customer_id === values[1] ||
        link.original_transaction_id === values[2]);
      return { rows, rowCount: rows.length };
    }
    if (text.includes('UPDATE apple_purchase_links SET product_id')) {
      const link = this.links.find(link => link.user_id === values[0])!;
      link.product_id = String(values[1]);
      link.original_purchased_at = values[2] as Date;
      return { rows: [], rowCount: 1 };
    }
    if (text.includes('INSERT INTO apple_purchase_links')) {
      this.inserted += 1;
      this.links.push({
        user_id: String(values[0]),
        customer_id: String(values[1]),
        original_transaction_id: String(values[2]),
        product_id: String(values[3]),
        original_purchased_at: values[4] as Date,
        association_source: 'automatic',
      });
      return { rows: [], rowCount: 1 };
    }
    throw new Error('Unexpected mocked SQL statement.');
  }
}

const FUTURE = '2099-01-01T00:00:00.000Z';
const PURCHASED = '2025-01-01T00:00:00.000Z';
const LINEAGE = '100000000001';

function validInput(userId: string, customerId: string): AutomaticAppleClaimInput {
  return {
    userId,
    customerId,
    originalTransactionId: LINEAGE,
    productId: 'com.rosterapp.player_pro_monthly',
    originalPurchasedAt: PURCHASED,
    expiresAt: FUTURE,
  };
}

test('mocked SQL claim serializes user and lineage and rejects duplicate lineage ownership', async () => {
  const client = new MockClaimClient();
  client.users.set('user-a', {
    id: 'user-a', role: 'free_tier', stripe_subscription_id: null,
    iap_original_transaction_id: null,
  });
  client.users.set('user-b', {
    id: 'user-b', role: 'free_tier', stripe_subscription_id: null,
    iap_original_transaction_id: null,
  });
  const first = validInput('user-a', `roster_ios_${'a'.repeat(64)}`);
  const second = validInput('user-b', `roster_ios_${'b'.repeat(64)}`);

  await claimAutomaticApplePurchaseWithClient(client, first);
  await assert.rejects(
    claimAutomaticApplePurchaseWithClient(client, second),
    { status: 409 },
  );
  assert.equal(client.inserted, 1);
  assert.deepEqual(client.releasedLocks.slice(0, 2), [LINEAGE, 'user-a']);
  assert.deepEqual(client.releasedLocks.slice(2, 4), [LINEAGE, 'user-b']);
});

test('legacy user original-transaction claim owned by another account blocks insertion', async () => {
  const client = new MockClaimClient();
  client.users.set('user-a', {
    id: 'user-a', role: 'free_tier', stripe_subscription_id: null,
    iap_original_transaction_id: null,
  });
  client.users.set('user-b', {
    id: 'user-b', role: 'player_pro', stripe_subscription_id: null,
    iap_original_transaction_id: LINEAGE,
  });

  await assert.rejects(
    claimAutomaticApplePurchaseWithClient(
      client, validInput('user-a', `roster_ios_${'a'.repeat(64)}`),
    ),
    { status: 409 },
  );
  assert.equal(client.inserted, 0);
});

test('verified Google token ownership does not block an independent Apple lineage claim', async () => {
  const client = new MockClaimClient();
  const googleToken = 'google-play-token-owned-by-user-a';
  client.users.set('user-a', {
    id: 'user-a', role: 'player_pro', stripe_subscription_id: null,
    iap_original_transaction_id: googleToken,
  });
  const tokenHash = createHash('sha256').update(googleToken).digest('hex');
  client.googleClaims.add(`${tokenHash}:user-a`);

  await claimAutomaticApplePurchaseWithClient(
    client, validInput('user-a', `roster_ios_${'a'.repeat(64)}`),
  );
  assert.equal(client.inserted, 1);
});

test('matching operator-attested link is preserved without automatic rewrite', async () => {
  const client = new MockClaimClient();
  const customerId = `roster_ios_${'a'.repeat(64)}`;
  client.users.set('user-a', {
    id: 'user-a', role: 'free_tier', stripe_subscription_id: null,
    iap_original_transaction_id: LINEAGE,
  });
  client.links.push({
    user_id: 'user-a',
    customer_id: customerId,
    original_transaction_id: LINEAGE,
    product_id: 'com.rosterapp.player_pro_monthly',
    original_purchased_at: new Date(PURCHASED),
    association_source: 'operator_attested',
  });

  await claimAutomaticApplePurchaseWithClient(
    client, validInput('user-a', customerId),
  );
  assert.equal(client.inserted, 0);
  assert.equal(client.links[0].association_source, 'operator_attested');
});

test('same-owner automatic Commissioner upgrade retains the original claim', async () => {
  const client = new MockClaimClient();
  const customerId = `roster_ios_${'a'.repeat(64)}`;
  client.users.set('user-a', {
    id: 'user-a', role: 'player_pro', stripe_subscription_id: null, iap_original_transaction_id: LINEAGE,
  });
  await claimAutomaticApplePurchaseWithClient(client, validInput('user-a', customerId));
  await claimAutomaticApplePurchaseWithClient(client, {
    ...validInput('user-a', customerId), productId: 'com.rosterapp.commissioner_monthly',
  });
  assert.equal(client.inserted, 1);
  assert.equal(client.links[0].original_transaction_id, LINEAGE);
  assert.equal(client.links[0].product_id, 'com.rosterapp.commissioner_monthly');
});