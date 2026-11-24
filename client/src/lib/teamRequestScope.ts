/** Family/authority transitions cancel the old surface's requests before
 * mounting the next one. Also used by isolated-DEV team-skin transitions. */
let controller = new AbortController();
export const teamRequestSignal = () => controller.signal;
export function resetTeamRequestScope() {
  controller.abort();
  controller = new AbortController();
}
