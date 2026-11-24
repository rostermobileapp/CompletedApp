import type WebSocket from "ws";

/** DEV only. Gate every outgoing payload as well as incoming actions; a timer
 * alone would leak broadcasts between revocation and its next tick. */
export function guardVerifiedAdultSocket(socket: WebSocket, authorize: () => Promise<boolean>) {
  const originalSend = socket.send.bind(socket);
  let closed = false;
  let outgoing = Promise.resolve();
  const allowed = async () => {
    if (closed || socket.readyState !== 1) return false;
    try {
      if (await authorize()) return !closed && socket.readyState === 1;
    } catch { /* Auth/database outages fail closed. */ }
    closed = true; socket.close(1008, "Parent or adult session verification required"); return false;
  };
  socket.send = ((...args: Parameters<WebSocket["send"]>) => {
    outgoing = outgoing.then(async () => { if (await allowed()) (originalSend as any)(...args); })
      .catch(() => { closed = true; socket.close(1011, "Session verification unavailable"); });
  }) as WebSocket["send"];
  const timer = setInterval(() => { void allowed(); }, 10_000);
  timer.unref();
  socket.once("close", () => { closed = true; clearInterval(timer); });
  return allowed;
}
