export function parseAppleBackfillArgs(args: string[]): { user?: string; all: boolean; apply: boolean } {
  let user: string | undefined;
  let all = false;
  let apply = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply') apply = true;
    else if (args[i] === '--all') all = true;
    else if (args[i] === '--user' && /^U\d{5}$/i.test(args[i + 1] ?? '') && !user) {
      user = args[++i].toUpperCase();
    } else throw new Error('Usage: --user U##### OR --all; optionally --apply. Default is dry run.');
  }
  if (Boolean(user) === all) throw new Error('Select exactly one scope: --user U##### or --all.');
  return { user, all, apply };
}

type Account = { id: string; displayId: string; hasAppleLink: boolean };
type BackfillResult = { displayId: string; status: string; role?: string; expiresAt?: string };
export interface AppleBackfillDependencies {
  loginId(userId: string): string;
  customerExists(loginId: string): Promise<boolean>;
  refresh(input: { userId: string; loginId: string; dryRun: boolean; syncCurrentStatus: boolean }): Promise<{
    verified: boolean; role?: string; expiresAt?: string;
  }>;
  report(result: BackfillResult): void;
}

/** Sequential, isolated per user. Preview never calls the applying path. */
export async function backfillAppleAccounts(
  accounts: Account[], apply: boolean, dependencies: AppleBackfillDependencies,
): Promise<{ checked: number; failed: number }> {
  let failed = 0;
  for (const account of accounts) {
    const report = (result: Omit<BackfillResult, 'displayId'>) =>
      dependencies.report({ displayId: account.displayId, ...result });
    if (account.hasAppleLink) { report({ status: 'existing_link_preserved' }); continue; }
    try {
      const loginId = dependencies.loginId(account.id);
      if (!await dependencies.customerExists(loginId)) {
        report({ status: 'no_existing_provider_customer' }); continue;
      }
      const result = await dependencies.refresh({
        userId: account.id, loginId, dryRun: !apply, syncCurrentStatus: true,
      });
      report({ status: result.verified ? apply ? 'applied' : 'verified_candidate' : 'inactive',
        role: result.role, expiresAt: result.expiresAt });
    } catch (error) {
      const status = (error as { status?: number })?.status;
      if (status === 402) report({ status: 'inactive' });
      else {
        failed++;
        report({ status: status === 409 ? 'ownership_conflict' : status === 202
          ? 'original_transaction_unverified' : 'verification_unavailable' });
      }
    }
  }
  return { checked: accounts.length, failed };
}
