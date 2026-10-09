export function isOpaqueCrossOriginScriptError(
  event: { message: string; error: unknown; filename: string },
  currentOrigin: string,
): boolean {
  if (event.message !== "Script error." || event.error != null) return false;
  if (!event.filename) return true;

  try {
    return new URL(event.filename, currentOrigin).origin !== currentOrigin;
  } catch {
    return true;
  }
}
