/** Isolated-DEV skin transitions cancel the old surface's requests before
 * mounting the next one. Production/adult-only navigation never invokes this. */
let controller = new AbortController();
export const teamRequestSignal = () => controller.signal;
export function resetTeamRequestScope() {
  controller.abort();
  controller = new AbortController();
}
