// Runs only against synthetic APIs and the real line editor on port 3002.
import assert from "node:assert/strict";
import WebSocket from "ws";
import { once } from "node:events";
const target = await (await fetch("http://127.0.0.1:9222/json/new?about:blank", { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await once(ws, "open");
let nextId = 0;
const pending = new Map(), errors = [];
ws.on("message", raw => {
  const message = JSON.parse(String(raw));
  if (message.id) {
    const callback = pending.get(message.id);
    pending.delete(message.id);
    message.error ? callback?.reject(message.error) : callback?.resolve(message.result);
  }
  if (message.method === "Runtime.exceptionThrown") errors.push(message.params.exceptionDetails.text);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params }));
});
async function ev(expression) {
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function wait(expression) {
  const end = Date.now() + 10000;
  while (Date.now() < end) {
    if (await ev(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  throw new Error(`Timeout: ${expression}\n${await ev("document.body.innerText")}`);
}
const badges = `[...document.querySelectorAll('[data-testid="line-combo-projection"]')]`;
const multiplier = Math.min(1.3, ((6*5+5*3)/(11*3))**0.7 * ((6*4+5*3)/(11*3))**0.15);
const click = selector => ev(`document.querySelector(${JSON.stringify(selector)}).click()`);
try {
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send("Page.navigate", { url: "http://127.0.0.1:3002/" });
  await wait(`!!document.querySelector('[data-testid="toggle-lines-view"]')`);
  await click('[data-testid="toggle-lines-view"]');
  await wait(`${badges}.some(b=>b.innerText.includes('Recorded 3.0 PPG'))`);
  assert.equal(await ev(`${badges}.some(b=>b.innerText.includes('Recorded 4.0 PPG'))`), true);
  assert.equal(await ev(`${badges}.some(b=>b.innerText.includes('Predicted ${(3*multiplier).toFixed(1)} PPG'))`), true);
  assert.equal(await ev(`document.querySelector('[data-testid="line-combo-opponent"]').innerText.includes('Ice Owls')`), true);
  await click('[data-testid="line-combo-opponent"] summary');
  assert.equal(await ev(`document.querySelector('[data-testid="line-combo-opponent"]').innerText.includes('4.0 GF/G · 5.0 GA/G')`), true);
  assert.equal(await ev(`document.querySelector('[data-testid="line-combo-opponent"]').innerText.includes('6 completed opponent games')`), true);
  console.log("PASS matchup rates and adjusted predictions display while recorded averages remain unchanged");
  await click('[data-slot-key="forward|0|LW"]');
  await wait(`!!document.querySelector('[data-testid="picker-player-d"]')`);
  await click('[data-testid="picker-player-d"]');
  await wait(`${badges}.some(b=>b.innerText.includes('Predicted ${(5*multiplier).toFixed(1)} PPG'))`);
  assert.equal(await ev(`${badges}.some(b=>b.innerText.includes('Predicted ${(2*multiplier).toFixed(1)} PPG'))`), true);
  assert.equal((await (await fetch("http://127.0.0.1:3002/__writes")).json()).writes, 0);
  console.log("PASS swapping players updates both previously unseen combos instantly, with no save or API write");
  assert.equal(await ev("document.documentElement.scrollWidth<=innerWidth"), true);
  console.log("PASS phone layout stays within its viewport with prediction labels");
  await click('[data-slot-key="forward|0|LW"]');
  await wait(`!!document.querySelector('[data-testid="picker-player-a"]')`);
  await click('[data-testid="picker-player-a"]');
  await wait(`${badges}.some(b=>b.innerText.includes('Recorded 3.0 PPG'))`);
  console.log("PASS restoring the original grouping restores the recorded average");
  await fetch("http://127.0.0.1:3002/__learn", { method: "POST" });
  await ev("window.fixtureRefetch()");
  await wait(`${badges}.some(b=>b.innerText.includes('Tuned · 4 games'))`);
  assert.equal(await ev(`Number((${badges}[0].innerText.match(/Predicted ([\\d.]+)/)||[])[1]) > ${(3*multiplier).toFixed(1)}`), true);
  assert.equal(await ev(`${badges}.some(b=>b.innerText.includes('Recorded 3.0 PPG'))`), true);
  console.log("PASS future outcomes change the predicted formula while recorded averages stay separate");
  await fetch("http://127.0.0.1:3002/__learn", { method: "DELETE" });
  await ev("window.fixtureRefetch()");
  await wait(`${badges}.some(b=>b.innerText.includes('Predicted ${(3*multiplier).toFixed(1)} PPG'))`);
  console.log("PASS correcting outcomes recalibrates the displayed prediction without changing the roster");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  assert.equal(await ev("document.documentElement.scrollWidth<=innerWidth"), true);
  assert.deepEqual(errors, []);
  console.log("PASS desktop layout fits; no unhandled browser exceptions");
} finally {
  ws.close();
  await fetch(`http://127.0.0.1:9222/json/close/${target.id}`);
}
