# Player Pro coverage audit and proposed rules

**Date:** November 24, 2026  
**Status:** Read-only audit; implementation requires approval.  
**Family limit:** Two child/player profiles, as reconfirmed by the owner. The attachment's four-profile allowance is superseded.

## Executive findings

1. **The league-seat storage model is already separate from account roles.** Current seat-assignment and backfill paths insert league grant/seat records, not global Pro roles. Do not rebuild that system or mass-downgrade accounts.
2. **The shared UI gate is tied to dashboard selection rather than the actual resource.** It recognizes a league seat when a league is selected, but not when a team is selected. It also uses that selected context for some account-wide features.
3. **API enforcement is inconsistent.** Scrimmages, league-filtered statistics, invoice creation and prediction details already have league-aware checks. League photos, announcements/comments and some messaging paths still use global roles. A league-covered user can see an enabled UI and then be denied by an API.
4. **An account role is not, by itself, a verified active personal subscription.** Existing code also supports secondary commissioners, manual grants, fee exemptions and founder/demo exceptions. The proposed entitlement resolver must separate those administrative/operational authorities from personal billing, without removing existing permissions by accident.
5. **Parent-to-child paid coverage is not implemented.** High School family flows remain guarded development intake. A completed adult adding a family context is also currently blocked. No active production family-entitlement system should be assumed.
6. **Live RLS does not currently implement Pro coverage.** The inspected production catalog has ten policies across public/storage; none references Player Pro, subscriptions or league seats. Relevant direct-client reads must agree with API responses, especially detailed game predictions.
7. **The deployed Edge Functions are not Pro entitlement services.** The prediction worker computes results; the separate award-image worker checks authenticated captain authority. Neither should start granting account roles.

## Evidence and limits

- Reviewed the current workspace's permission helpers, role comparisons, feature gates, grant/seat storage, payment/purchase role writers and wrapping call sites.
- Inspected live Supabase policy metadata, table RLS flags and relevant database helper definitions using read-only queries. No player records, payment records or account identities were queried.
- Inspected policy metadata in the separate development Supabase project; its two visible public policies also contain no Pro entitlement conditions. Private HS application access remains mediated by its guarded server flow; an absence of policies is not permission to expose it.
- Inspected both deployed Edge Function application source bundles: `recalculate-win-chance` and `dynamic-service`.
- The accompanying reference appendix indexes **482 matching references across 65 source files**, including references within **60 registrations in the main API routes file**, plus identified wrapper callers. It includes definitions, purchase synchronization and display/copy references as well as actual gates; those are not all independent permission decisions.
- This is a static/code-and-catalog audit, not an authenticated API regression run. The workspace source was not asserted to be the exact currently deployed Railway server version. Historical role promotions were not inferred from current code.
- No application code, account roles, seats, subscriptions, policies, provider settings or deployments were changed. No emails, messages, charges or real accounts were created.

## Current entitlement decision points

| Area | Current behavior and evidence |
| --- | --- |
| Shared UI permission provider | `client/src/context/SubscriptionContext.tsx`: role hierarchy grants global access for Player Pro and higher; an approved selected tournament can grant tournament-context access; league seats count only when `selectedType` is `league`. The helper accepts no resource argument. |
| Global server middleware/helpers | `server/permissionMiddleware.ts`: `requirePremiumFeatures`, `canAccessPremiumFeatures`, hierarchy comparisons and global role helpers. Fee exemptions are recognized by some helpers but not all. The old automatic Stripe verifier is disabled in permission loading; do not re-enable its cancellation behavior as part of this change. |
| League-aware server middleware/helpers | `requireLeaguePremiumFeatures` and `canAccessLeaguePremiumFeatures` already combine global access with an active seat for a supplied league. They do not provide a shared team-to-league or child-to-parent resolution boundary. |
| Player/team statistics | `server/routes.ts`: `canViewPlayerStats`, `filterPlayerStats` and their callers; `server/teamStatsRoute.ts` separately computes global/league-seat eligibility. Free access to a player's own/current-team statistics must remain. |
| Scrimmage management | Resource-derived league checks already cover organizer routes, request management, invites, backups, co-hosts, finalization and invoice sending. UI creation/management screens have their own seat checks. Retain organizer/co-host authority separately from entitlement. |
| Invoices/payment requests | Creation and certain edits use league-aware checks; the UI also uses the selected-context helper. Existing owner-controlled requests must remain viewable/manageable without a current subscription. Merchant/card onboarding has additional global eligibility and pilot restrictions. |
| Predictions and detailed odds | The game API determines league coverage and returns only summary data without it. The live `game_predictions_team_read` policy checks membership/captain relationships, not paid entitlement. Do not assume the API's detail masking protects a separate direct-client table read. |
| League/tournament media | Upload, create, view, delete and ZIP-download routes repeat global paid-role checks. The gallery uses both selected-context access and a separate global-role check. `/api/photos/quota` is globally gated. |
| Announcements and comments | Posting/comment APIs repeat account-role hierarchy checks; the UI uses its shared selected-context helper, with some scoped commissioner handling. |
| Messaging | UI thread locking, attachments, GIFs, polls and payment actions use a single selected-context premium boolean. The ordinary message-send API separately checks the sender's global Free role and conversation type, including an existing founder-support exception. Resource context must come from the actual conversation, not the dashboard. |
| Profile/payment methods | The Profile payment-methods panel is locked by the selected-context helper even though it is an account-level panel. Personal/contact editing must not be indiscriminately paywalled. |
| Paid patch/Trophy Case presentation | `shared/trophyCaseAccess.ts`, Trophy Case/Earned Patches, trivia presentation and server badge routes/evaluators use global-role/primary-commissioner checks. Award earning, stored achievements and age restrictions are separate from paid artwork visibility. |
| Global labels, ads and promotional display | Profile/UserProfile tier labels, ad-banner/layout consumers and the HPIB paid-user banner use account-role checks. These are display decisions, not authority to upgrade another league. |
| Purchase and account maintenance | Stripe synchronization/webhooks, Apple/Google/RevenueCat verified purchase/reconciliation paths and account-merge handling write or preserve personal tier state. Keep provider ownership, verification, expiry and account-race safeguards. |
| League administration | Commissioner/co-commissioner, captain, admin and stat-manager checks control management authority. A Pro seat must not create those permissions; personal Pro must not grant membership or management authority either. |

## League seats today

### Records and purchase lifecycle

- `league_pro_grants` stores the buying league, purchaser, seat count, inclusive `start_month`/`end_month`, paid/pending/cancelled status, pricing snapshot and Stripe checkout/payment references.
- `league_pro_seats` stores one assignment per `(grant_id, user_id)`, together with the league and assignment time. Its foreign keys connect assignments to their grant, league and user.
- Assignment locks the grant before checking capacity. Duplicate assignments in the same grant are idempotent.
- Approved membership/backfill flows assign seats from eligible paid grants. Existing globally Pro-or-higher users are skipped to avoid consuming seats unnecessarily.
- Multiple overlapping paid grants may assign the same user in separate grant records so coverage can continue after an earlier grant expires.
- The current month is computed in UTC as `YYYY-MM`. Coverage includes both the grant's start and end month; it is not a per-day timestamp window.

### Current-user endpoints

| Endpoint | Returned state |
| --- | --- |
| `/api/user/league-pro-seats` | Current paid-window assignments: league ID/name, grant ID, assignment time and start/end months. |
| `/api/user/league-pro-seats-upcoming` | Future paid grant assignments, filtered through approved league membership. |
| `/api/user/league-pro-seats-full` | Approved member's leagues whose active aggregate seat capacity is exhausted and where that member has no active seat. This explains lack of coverage; it grants none. |

Current active-seat lookups do not consistently join approved membership, unlike the upcoming-seat lookup. The replacement resolver must not turn a stale seat into team membership or resource authority.

**Does a seat change the whole account's role?** Not in the inspected assignment/backfill paths. Existing code explicitly intends league-scoped elevation. No bulk role reset is justified by this audit; historical data would require separate evidence and approval.

The Subscription notice currently says a league “covers your Player Pro access through [month]. No personal upgrade needed.” That omits the league boundary and can mislead a parent who also plays elsewhere.

## Feature classification proposed for confirmation

### Paid features with no single team/league context: personal subscription only

1. Account-level profile/payment-method extras.
2. Paid Trophy Case/patch artwork and related account-level presentation; earning awards and age/minor restrictions remain unchanged.
3. Account-wide paid-tier labels, ad-free status and paid-user promotional display.
4. Cross-team personal DMs or arbitrary groups without one defensible league owner, including their premium attachments/GIFs/polls. Existing support exceptions are separate.
5. Account-level photo quota/dashboard tooling, rather than permission to upload to a particular league.
6. Organizer merchant-account setup and its account-level eligibility, with existing payment-provider/pilot restrictions retained.
7. Cross-league advanced/career access with no resource league, while preserving currently free self/current-team statistics.

These are the proposed defaults to approve with the implementation plan. A league seat must not make any of them globally Pro merely because that league is selected on the dashboard.

### Team/league-specific paid features: personal subscription OR that league's seat

- League photo operations and media controls, with ownership and membership still enforced.
- Detailed game odds, advanced/opponent statistics and related team/league dashboards.
- League announcements and comments.
- Scrimmage organization and related roster/invite/payment operations for a scrimmage owned by that league.
- Creating league-linked payment requests, without changing who can manage existing requests or receive/pay an invoice.
- Premium messaging tools in a conversation that genuinely belongs to a single permitted team/league, subject to existing safety and membership rules.

An operation spanning several resources must check every resource involved; one paid league must not authorize a batch that also touches an unpaid league.

### Preserve separately; not new subscription requirements

- Existing free schedule, RSVP, own/current-team statistics and basic team-chat access.
- Award eligibility/history, as distinct from paid presentation.
- Basic win-chance summaries, separate from paid odds details.
- Existing request owners' payment tracking and payment confirmation.
- Captain/commissioner/co-commissioner/admin/stat-manager authority and resource ownership.
- Parent-device verification and all child-specific restrictions. A paid parent does not unlock parent payment tools, DMs or coach messaging for a child.
- Existing tournament-only access: retain it as a separate tournament-specific rule unless explicitly changed. It must never satisfy a league/team Pro check outside its tournament.
- Founder/demo, support-thread and manual/complimentary entitlements need explicit classification; do not silently remove operational exceptions or call a manual role proof of a paid subscription.

## RLS and Edge Function findings

### Live database policies

The ten inspected live policies concern:

- Custom team-award settings, definitions, grants and grant events.
- Team-award image storage reads/inserts/updates.
- Game prediction reads.
- Organizer payment participant reads.
- Connected merchant-account owner reads.

None currently resolves a personal subscription, league seat or parent entitlement. Referenced team-award helpers check feature enablement and roster/captain authority, not Pro.

RLS is enabled on core tables including users, memberships, league grants and seats, but they have no matching policies in the inspected catalog. **With RLS enabled, no applicable policy means direct ordinary-client access is denied, not public.** Existing table grants alone do not establish data exposure.

The server's privileged database operations still need explicit application authorization. Adding an RLS helper does not replace API checks, and adding API checks does not protect a separately permitted direct-client table read.

Prediction detail protection needs particular care: retain the free summary boundary while restricting paid detail fields. A blanket paid-only policy on the entire prediction row could break free summaries; choose a protected-detail/view/server boundary intentionally.

### Deployed functions

| Function | Audit result |
| --- | --- |
| `recalculate-win-chance` | Internal prediction computation, with worker authentication handled independently. Application sources contain no Player Pro/league-seat decisions. Do not paywall the computation worker or grant roles from it. |
| `dynamic-service` | Award-image background removal; authenticates the caller and invokes captain/quota authorization. Application source contains no Player Pro/league-seat decision. Preserve this authority and provider boundary. |

No function was invoked or redeployed during this audit.

## Proposed implementation

1. Introduce one explicit personal-entitlement result backed by the existing verified personal purchase sources, keeping billing status separate from administrative roles and league grants. Do not call payment providers on every feature request or replace store verification.
2. Add one shared context contract for Pro checks. Resolve the actual team/game/conversation/scrimmage to its owning league on the server; never trust an unrelated league ID or the selected dashboard value as resource authority.
3. Reuse existing paid grant/seat records and inclusive month windows. Validate grant status and league scope, keep assignment capacity/idempotency, and do not promote account roles.
4. Resolve a child's verified parent/household independently of the session's claimed IDs. A personal subscription covers the parent's own teams and eligible child teams; a league seat covers only teams in that seat's league. Keep the household maximum at two.
5. Bring the identified API gates, RLS/direct-read boundary and UI consumers onto the same classified rules. Preserve membership, ownership, administrative authority and minor-safety checks as additional requirements.
6. Update the Subscription notice to “[League name] covers your Player Pro on [League name] teams through [month].” Show “Your other teams are on the Free plan. Upgrade to get Player Pro everywhere.” only when the user actually has uncovered teams and lacks personal coverage; account for multiple leagues' seats.
7. Test with synthetic development fixtures and direct authenticated API/database-read checks. Prepare a separate rollout/reconciliation review without touching production roles, billing or HS activation.

## Acceptance matrix

| Personal subscription | Active seat | Requested context | Expected Pro result |
| --- | --- | --- | --- |
| Player Pro or Commissioner | None | Any of the adult's approved adult/HS teams | Yes |
| Player Pro or Commissioner | None | Eligible child team's context | Yes through verified parent |
| None | HS league A | Parent or child team in A | Yes |
| None | HS league A | Parent's adult league B | No |
| None | Adult league B | Adult team in B | Yes |
| None | Adult league B | Any other league | No |
| None | A and B | Teams in A or B | Yes, independently |
| None | A and B | Team in C, or account-level paid extra | No |
| None | Future/expired/unpaid/cancelled grant | Team in that league | No |
| None | A | Team in B while dashboard still selects A | No |
| None | A | Unrelated or unauthorized child/team identity | No authority granted |

Also verify: start/end month edges; stale/removed memberships; legacy admin/complimentary cases; profile switching and cache isolation; team-to-league moves; mixed-league batches; actual resource ownership; no seat-based role writes; two-player validation; preservation of existing personal subscriber and Commissioner behavior.

**Approval boundary:** Approving this plan authorizes only the agreed implementation and synthetic DEV verification. It does not authorize publishing, production SQL/data corrections, real purchases, outgoing communications, or activation of guarded family/child access.
