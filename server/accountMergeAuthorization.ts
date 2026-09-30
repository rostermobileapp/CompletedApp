/** League commissioner status is intentionally irrelevant to account-wide support access. */
export function hasAccountMergeOperatorContext(context: {
  demoContext?: unknown;
  user?: { claims?: { email?: string; sub?: string } };
  realActor?: { id?: string };
}): boolean {
  return !context.demoContext &&
    context.user?.claims?.email?.toLowerCase() === 'tobin@rosterhockey.com' &&
    !!context.user.claims.sub &&
    context.realActor?.id === context.user.claims.sub;
}