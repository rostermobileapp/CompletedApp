import './accountMergeLocalFixture';
import { before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { pool } from '../db';
import { initAccountUserMergeDb } from '../accountUserMergeDbInit';
import { previewAccountUserMerge, confirmAccountUserMerge, searchAccountUsers } from '../accountUserMerge';

const q = (text: string, values: any[] = []) => pool.query(text, values);
let source: string, target: string, actor: string, outsider: string, league: string;
const access = () => ({ operatorId: actor, leagueId: league });
const preview = () => previewAccountUserMerge(source, target, access());
const confirm = (p: Awaited<ReturnType<typeof preview>>) =>
  confirmAccountUserMerge(p.source.id, p.survivor.id, actor, p.fingerprint, league);
before(initAccountUserMergeDb);
beforeEach(async () => {
  await q('TRUNCATE users CASCADE');
  await q('TRUNCATE google_iap_claims');
  await q('TRUNCATE badge_definitions CASCADE');
  [source, target, actor, outsider, league] = Array.from({ length: 5 }, randomUUID);
  await q(`INSERT INTO users(id,display_id,email,first_name) VALUES
    ($1,'U90001','source@example.test','Source'),($2,'U90002','parent@example.test','Parent'),
    ($3,'U90000','commissioner@example.test','Commissioner'),($4,'U90003','outsider@example.test','Outsider')`,
  [source, target, actor, outsider]);
  await q(`INSERT INTO leagues(id,name,unique_league_id,sport,commissioner_id) VALUES ($1,'Managed league','L99001','hockey',$2)`, [league, actor]);
  await q(`INSERT INTO league_memberships(user_id,league_id,status) VALUES ($1,$3,'approved'),($2,$3,'approved')`, [source, target, league]);
});

test('a real league commissioner combines free accounts across leagues with provenance and retirement', async () => {
  const outsideLeague = randomUUID(), team = randomUUID(), announcement = randomUUID();
  await q(`INSERT INTO leagues(id,name,unique_league_id,sport,commissioner_id)
    VALUES ($1,'Other league','L99002','hockey',$2)`, [outsideLeague, source]);
  await q(`INSERT INTO league_memberships(user_id,league_id,status,league_role)
    VALUES ($1,$2,'approved','secondary_commissioner')`, [source, outsideLeague]);
  await q(`INSERT INTO teams(id,name,league_id,captain_id,creator_id) VALUES ($1,'Outside team',$2,$3,$3)`, [team, outsideLeague, source]);
  await q(`INSERT INTO team_memberships(user_id,team_id,status,is_captain) VALUES ($1,$2,'approved',true)`, [source, team]);
  await q(`INSERT INTO player_stats(user_id,league_id,goals,games_played) VALUES ($1,$2,7,2)`, [source, outsideLeague]);
  await q(`INSERT INTO announcements(id,league_id,author_id,content) VALUES ($1,$2,$3,'Keep authored history')`, [announcement, outsideLeague, source]);
  await q('INSERT INTO announcement_comments(announcement_id,author_id,content) VALUES ($1,$2,$3)', [announcement, source, 'Preserve comment']);
  for (const user of [source, target]) {
    await q('INSERT INTO announcement_read_status(announcement_id,user_id) VALUES ($1,$2)', [announcement, user]);
    await q('INSERT INTO announcement_visibility(announcement_id,user_id) VALUES ($1,$2)', [announcement, user]);
    await q('INSERT INTO league_invites_sent(league_id,user_id,method) VALUES ($1,$2,$3)', [league, user, 'email']);
  }
  const p = await preview();
  assert.equal(p.policy.kind, 'free_free');
  assert.deepEqual(p.blockers, []);
  // Authentication updates this timestamp on every request; it must not make
  // the reviewed content stale by itself.
  await q('UPDATE users SET updated_at=NOW() WHERE id=$1', [source]);
  await confirm(p);
  assert.equal((await q('SELECT commissioner_id FROM leagues WHERE id=$1', [outsideLeague])).rows[0].commissioner_id, target);
  assert.equal((await q('SELECT captain_id FROM teams WHERE id=$1', [team])).rows[0].captain_id, target);
  assert.equal((await q('SELECT goals FROM player_stats WHERE user_id=$1', [target])).rows[0].goals, 7);
  assert.equal((await q('SELECT author_id FROM announcements WHERE id=$1', [announcement])).rows[0].author_id, target);
  assert.equal((await q('SELECT count(*)::int n FROM announcement_read_status WHERE announcement_id=$1', [announcement])).rows[0].n, 1);
  assert.equal((await q('SELECT email,first_name FROM users WHERE id=$1', [target])).rows[0].email, 'parent@example.test');
  assert.ok((await q('SELECT deleted_at FROM users WHERE id=$1', [source])).rows[0].deleted_at);
  const audit = (await q('SELECT * FROM account_user_merges WHERE source_user_id=$1', [source])).rows[0];
  assert.equal(audit.authorization_league_id, league);
  assert.equal(audit.activity_provenance['announcements.author_id'][0].author_id, source);
  await assert.rejects(q('UPDATE users SET deleted_at=NULL WHERE id=$1', [source]), /Retired account/);
  assert.equal((await confirm(p)).alreadyMerged, true);
});

for (const paidRole of ['player_pro', 'commissioner', 'secondary_commissioner']) {
  for (const order of ['source', 'target']) {
    test(`${paidRole} + free keeps the paid login and all provider ownership (${order} paid)`, async () => {
      const paid = order === 'source' ? source : target, free = paid === source ? target : source;
      await q(`UPDATE users SET role=$2,stripe_customer_id='fixture-customer',stripe_subscription_id='fixture-subscription',
        iap_original_transaction_id='fixture-apple-original' WHERE id=$1`, [paid, paidRole]);
      await q(`INSERT INTO google_iap_claims(token_hash,user_id,expires_at) VALUES ($1,$2,NOW()+INTERVAL '1 year')`, ['f'.repeat(64), paid]);
      await q(`INSERT INTO apple_purchase_links(user_id,customer_id,original_transaction_id,product_id,original_purchased_at,expires_at)
        VALUES ($1,'fixture-native-customer','fixture-apple-original','fixture-product',NOW(),NOW()+INTERVAL '1 year')`, [paid]);
      const p = await preview();
      assert.equal(p.source.id, free); assert.equal(p.survivor.id, paid);
      assert.equal(p.policy.kind, 'keep_paid'); assert.equal(p.policy.autoSelected, order === 'source');
      assert.deepEqual(p.blockers, []);
      if (order === 'source') await assert.rejects(confirmAccountUserMerge(source, target, actor, p.fingerprint, league), /non-free profile must be the parent/);
      await confirm(p);
      assert.equal((await q('SELECT role,stripe_subscription_id FROM users WHERE id=$1', [paid])).rows[0].stripe_subscription_id, 'fixture-subscription');
      assert.equal((await q('SELECT user_id FROM google_iap_claims')).rows[0].user_id, paid);
      assert.equal((await q('SELECT user_id FROM apple_purchase_links')).rows[0].user_id, paid);
      assert.ok((await q('SELECT deleted_at FROM users WHERE id=$1', [free])).rows[0].deleted_at);
    });
  }
}

test('two non-free tiers block until billing resolution and reject stale previews', async () => {
  await q(`UPDATE users SET role=CASE WHEN id=$1 THEN 'player_pro'::user_role ELSE 'commissioner'::user_role END WHERE id IN ($1,$2)`, [source, target]);
  const blocked = await preview();
  assert.equal(blocked.policy.kind, 'billing_duplicate');
  assert.match(blocked.policy.message, /Resolve duplicate account billing/);
  await assert.rejects(confirm(blocked), /billing.duplicate/);
  assert.equal((await q('SELECT count(*)::int n FROM account_user_merges')).rows[0].n, 0);
  await q(`UPDATE users SET role='free_tier' WHERE id=$1`, [source]);
  await assert.rejects(confirm(blocked), /changed after review/);
  const fresh = await preview();
  assert.equal(fresh.policy.kind, 'keep_paid');
  await confirm(fresh);
});

test('current membership, commissioner access, support scope and stale permissions are enforced', async () => {
  const p = await preview();
  await assert.rejects(previewAccountUserMerge(source, target, { operatorId: outsider, leagueId: league }), /commissioner/);
  await assert.rejects(confirmAccountUserMerge(source, target, outsider, p.fingerprint, league), /commissioner/);
  await assert.rejects(confirmAccountUserMerge(source, target, actor, p.fingerprint), /Global account support/);
  assert.deepEqual(await searchAccountUsers('U90003', league), []);
  await q('UPDATE leagues SET commissioner_id=$2 WHERE id=$1', [league, outsider]);
  await assert.rejects(confirm(p), /commissioner/);
  await q('UPDATE leagues SET commissioner_id=$2 WHERE id=$1', [league, actor]);
  await q('DELETE FROM league_memberships WHERE league_id=$1 AND user_id=$2', [league, target]);
  await assert.rejects(confirm(p), /Both accounts must be active registered U/);
  assert.equal((await q('SELECT count(*)::int n FROM users WHERE deleted_at IS NOT NULL')).rows[0].n, 0);
});

test('multi-option differing votes require review, equivalent votes combine once', async () => {
  const ann = randomUUID(), poll = randomUUID();
  await q(`INSERT INTO announcements(id,league_id,author_id,content) VALUES ($1,$2,$3,'Vote')`, [ann, league, actor]);
  await q(`INSERT INTO announcement_polls(id,announcement_id,question,options,allow_multiple)
    VALUES ($1,$2,'Which option?','["A","B"]',true)`, [poll, ann]);
  await q('INSERT INTO announcement_poll_votes(poll_id,user_id,option_index) VALUES ($1,$2,0),($1,$3,0),($1,$3,1)', [poll, source, target]);
  const p = await preview();
  assert.ok(p.blockers.some(b => b.domain === 'announcement_poll_votes' && b.recordIds?.includes(poll)));
  await assert.rejects(confirm(p), /different poll answers/);
  await q('DELETE FROM announcement_poll_votes WHERE poll_id=$1 AND option_index=1', [poll]);
  await confirm(await preview());
  assert.equal((await q('SELECT count(*)::int n FROM announcement_poll_votes WHERE poll_id=$1', [poll])).rows[0].n, 1);
});

test('unknown references fail closed and the entire merge remains unchanged', async () => {
  await q('CREATE TABLE merge_unclassified_fixture(id varchar PRIMARY KEY,user_id varchar REFERENCES users(id))');
  try {
    await q("INSERT INTO merge_unclassified_fixture VALUES ('unknown',$1)", [source]);
    const p = await preview();
    assert.ok(p.blockers.some(b => b.domain === 'merge_unclassified_fixture.user_id'));
    await assert.rejects(confirm(p), /not explicitly classified/);
    assert.equal((await q('SELECT count(*)::int n FROM league_memberships WHERE user_id=$1', [source])).rows[0].n, 1);
  } finally { await q('DROP TABLE merge_unclassified_fixture'); }
});

test('changing a verified sign-in identity invalidates the account merge review', async () => {
  const authIdentities: [string, string][] = [[source, 'original-sign-in'], [target, 'parent-sign-in']];
  const p = await previewAccountUserMerge(source, target, { ...access(), authIdentities });
  await assert.rejects(confirmAccountUserMerge(source, target, actor, p.fingerprint, league,
    [[source, 'replacement-sign-in'], [target, 'parent-sign-in']]), /changed after review/);
  assert.equal((await q('SELECT count(*)::int n FROM account_user_merges')).rows[0].n, 0);
});

test('badge duplicates preserve acknowledged delivery, payload references and original audit', async () => {
  const badge = randomUUID(), srcAward = randomUUID(), dstAward = randomUUID();
  await q(`INSERT INTO badge_definitions(id,slug,name,description,category,trigger_type,status)
    VALUES ($1,'fixture-merge-badge','Fixture badge','Fixture','achievement','manual','published')`, [badge]);
  await q(`INSERT INTO badge_awards(id,badge_definition_id,user_id,scope_key,tier,source)
    VALUES ($1,$3,$4,'global','bronze','manual'),($2,$3,$5,'global','bronze','manual')`, [srcAward, dstAward, badge, source, target]);
  for (const [user, award] of [[source, srcAward], [target, dstAward]]) {
    await q(`INSERT INTO badge_earned_events(user_id,badge_award_id,badge_definition_id,event_type,payload,acknowledged_at)
      VALUES ($1,$2,$3,'earned',$4::jsonb,CASE WHEN $5 THEN NOW() ELSE NULL END)`,
    [user, award, badge, JSON.stringify({ awardId: award, tier: 'bronze' }), user === source]);
  }
  await confirm(await preview());
  const events = (await q('SELECT * FROM badge_earned_events WHERE user_id=$1', [target])).rows;
  assert.equal(events.length, 1); assert.ok(events[0].acknowledged_at);
  assert.equal(events[0].badge_award_id, dstAward); assert.equal(events[0].payload.awardId, dstAward);
  assert.equal((await q('SELECT count(*)::int n FROM badge_awards WHERE user_id=$1', [target])).rows[0].n, 1);
  const audit = (await q('SELECT activity_provenance FROM account_user_merges WHERE source_user_id=$1', [source])).rows[0];
  assert.equal(audit.activity_provenance.badge_events.length, 2);
});

test('scrimmage responses and co-host permission differences block, sent reminders never replay', async () => {
  const scrimmage = randomUUID();
  await q(`INSERT INTO scrimmages(id,league_id,creator_id,title,date_time,location,max_players,invite_user_ids)
    VALUES ($1,$2,$3,'Fixture',NOW(),'Test rink',10,ARRAY[$4,$5])`, [scrimmage, league, source, source, target]);
  await q(`INSERT INTO scrimmage_requests(scrimmage_id,player_id,status)
    VALUES ($1,$2,'approved'),($1,$3,'dismissed')`, [scrimmage, source, target]);
  for (const user of [source, target]) {
    await q('INSERT INTO scrimmage_reminders_sent(scrimmage_id,player_id,hours_before) VALUES ($1,$2,24)', [scrimmage, user]);
    await q('INSERT INTO scrimmage_co_hosts(scrimmage_id,user_id,added_by,can_manage_payments) VALUES ($1,$2,$3,$4)', [scrimmage, user, actor, user === source]);
  }
  const blocked = await preview();
  assert.ok(blocked.blockers.some(b => b.domain === 'scrimmage_requests'));
  assert.ok(blocked.blockers.some(b => b.domain === 'scrimmage_co_hosts'));
  await assert.rejects(confirm(blocked), /Merge blocked/);
  await q(`UPDATE scrimmage_requests SET status='approved' WHERE scrimmage_id=$1`, [scrimmage]);
  await q('UPDATE scrimmage_co_hosts SET can_manage_payments=true WHERE scrimmage_id=$1', [scrimmage]);
  await confirm(await preview());
  assert.equal((await q('SELECT count(*)::int n FROM scrimmage_reminders_sent')).rows[0].n, 1);
  assert.deepEqual((await q('SELECT invite_user_ids FROM scrimmages WHERE id=$1', [scrimmage])).rows[0].invite_user_ids, [target]);
});

test('free profiles with verified inactive native history may merge without moving purchase claims', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ subscriber: { subscriptions: {}, entitlements: {} } }), { status: 200 })) as typeof fetch;
  try {
    await q(`INSERT INTO apple_purchase_links(user_id,customer_id,original_transaction_id,product_id,original_purchased_at,expires_at)
      VALUES ($1,'fixture-old-canonical-customer','fixture-old-original','fixture-product',NOW()-INTERVAL '2 years',NOW()-INTERVAL '1 year')`, [source]);
    await q(`INSERT INTO google_iap_claims(token_hash,user_id,expires_at) VALUES ($1,$2,NOW()-INTERVAL '1 year')`, ['e'.repeat(64), source]);
    const p = await preview();
    assert.equal(p.policy.kind, 'free_free');
    assert.deepEqual(p.blockers, []);
    await confirm(p);
    assert.equal((await q('SELECT user_id FROM apple_purchase_links')).rows[0].user_id, source);
    assert.equal((await q('SELECT user_id FROM google_iap_claims')).rows[0].user_id, source);
    assert.ok((await q('SELECT deleted_at FROM users WHERE id=$1', [source])).rows[0].deleted_at);
  } finally { globalThis.fetch = originalFetch; }
});

test('a supposedly free profile with an active native purchase requires verification and does not retire', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ subscriber: {
    subscriptions: { fixture: { expires_date: '2100-01-01T00:00:00Z' } }, entitlements: {},
  } }), { status: 200 })) as typeof fetch;
  try {
    await q(`INSERT INTO google_iap_claims(token_hash,user_id,expires_at) VALUES ($1,$2,NOW()+INTERVAL '1 year')`, ['e'.repeat(64), source]);
    const p = await preview();
    assert.equal(p.policy.kind, 'verification_required');
    await assert.rejects(confirm(p), /active purchase/);
    assert.equal((await q('SELECT count(*)::int n FROM account_user_merges')).rows[0].n, 0);
  } finally { globalThis.fetch = originalFetch; }
});
