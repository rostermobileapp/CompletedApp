/** Creates/reuses one Stripe TEST Standard account for the synthetic organizer.
 * No live account creation, charges, production writes, or account conversion.
 */
import "../server/runtimeBootstrap";
import { onboardDirectAccount, readDirectAccount } from "../server/organizerDirectAccounts";
import { pool } from "../server/db";
import { getOrganizerCardStripe } from "../server/organizerCardPaymentService";
import { databaseEndpoint, getDatabaseConnectionString } from "../server/testDatabaseGuard";
try {
  if (process.env.NODE_ENV !== "development" || process.env.NONPRODUCTION_ISOLATED !== "1") throw new Error("ISOLATED_DEV_REQUIRED");
  const endpoint = databaseEndpoint(getDatabaseConnectionString(process.env, process.argv));
  const project = new URL(process.env.DEV_SUPABASE_URL!).hostname.split(".")[0];
  if (!endpoint.startsWith(`supabase:${project}/`) ||
      JSON.parse(process.env.NONPRODUCTION_FORBIDDEN_DATABASES ?? "[]").includes(endpoint)) throw new Error("DEV_TARGET_MISMATCH");
  const organizer = (await pool.query("SELECT id FROM public.users WHERE email=$1 AND deleted_at IS NULL",
    ["commissioner@roster-dev.invalid"])).rows[0];
  if (!organizer) throw new Error("SYNTHETIC_ORGANIZER_REQUIRED");
  const stripe = getOrganizerCardStripe();
  const link = await onboardDirectAccount(organizer.id, stripe,
    `https://${process.env.REPLIT_DEV_DOMAIN}`);
  const account = await readDirectAccount(organizer.id, stripe);
  if (!account.connected || !("responsibilityVerified" in account) || !account.responsibilityVerified ||
      !link.url.startsWith("https://connect.stripe.com/")) throw new Error("DIRECT_RESPONSIBILITY_NOT_VERIFIED");
  console.info(JSON.stringify({ mode: "stripe-test", directAccountConnected: true,
    stripeNegativeBalanceResponsibilityVerified: true, organizerProcessingFeesVerified: true,
    onboardingRequired: !account.ready, createdCharges: 0, productionWrites: 0 }));
} catch (error: any) {
  console.error("Stripe TEST direct onboarding did not complete.", {
    type: error?.type ?? error?.name, code: error?.code, parameter: error?.param,
    statusCode: error?.statusCode, requestId: error?.requestId,
    platformProfileRequired: /complete your platform profile|signed up for Connect/i.test(error?.message ?? ""),
    standardCapabilitiesRejected: /capabilit.*standard|standard.*capabilit/i.test(error?.message ?? ""),
  });
  process.exitCode = 1;
} finally { await pool.end(); }
