# Adult access and child-device cutover

This change is not a production release or a password rotation.

## Before releasing

- Children must use their approved child-device session and setup code, never
  the adult account's password.
- **Change any adult password previously shared with a child before releasing
  the adult-access separation.** The new account model cannot distinguish two
  people using the same old adult credential. Do not treat a paid role as proof
  that the person entering that password is the adult.
- Use the protected parent password-change flow for Family-enrolled accounts;
  it keeps fresh email proof and session revocation. No password, provider
  setting or production record has been changed by this implementation.
- Release the frontend and Railway backend together. No new schema migration
  is required; the existing school onboarding/staff/Family installations and
  limited testing gate must already be present.

## Expected testing flow

League creation uses normal commissioner authentication and permissions, then
opens `/league-management?leagueId=<created league>`.

The school management workspace checks the actual league owner. It supports
creating approved programs and canonical teams, issuing recipient-bound
staff/parent invitation codes for manual sharing, reviewing pending requests,
and previewing/importing team schedules. It does not add an AD or coach
membership to the commissioner, unlock the commissioner's parent controls,
or allow them to approve their own child's request.

Production school staff testing remains restricted to the existing server
allowlist. Code issuance does not expand that allowlist. Recipients must still
meet the existing rollout eligibility when redeeming the invitation.

Invitations are shown for manual sharing, not automatically emailed. Schedule
imports use the existing durable testing notification outbox; pending delivery
is reported as pending, not as a successful notification.

Parent controls/password changes still require parent-purpose proof. Opaque
child-device credentials and forged adult claims must fail the adult provider
authentication boundary. Public High School/Youth search and request-to-join
remain closed without a valid invitation or team code.
