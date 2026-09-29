---
name: Google Play sandbox isolation
description: Keep direct Play purchase and restore verification from granting production access to license-test purchases.
---

Production sandbox isolation must apply to every independent entitlement path, not only RevenueCat webhook processing. Google's subscription-verification response identifies license-test purchases by the presence of `testPurchase`, which can be an empty object; reject these before claiming production access.

**Why:** The legacy Android purchase and restore flows verify directly with Google and can grant roles independently of RevenueCat's sandbox-segregated webhook. A sandbox test against production could otherwise create a real premium account.

**How to apply:** When adding or changing any direct Play verification, restore, order recovery, or asynchronous reconciliation flow, ensure test receipts are rejected before entitlement mutation in production. Keep the paywall disabled until real-device purchase and restore behavior has been checked.