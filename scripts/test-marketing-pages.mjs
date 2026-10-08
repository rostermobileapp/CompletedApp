// Browser smoke checks for the graduated marketing pages.
// Start an isolated Chromium with --remote-debugging-port=9223, then run:
// MARKETING_TEST_ORIGIN=https://your-development-domain node scripts/test-marketing-pages.mjs
// All application POSTs are intercepted: these checks never submit real enquiries.
import assert from "node:assert/strict";
import WebSocket from "ws";

const origin = process.env.MARKETING_TEST_ORIGIN || `https://${process.env.REPLIT_DEV_DOMAIN}`;
assert(!origin.includes("undefined"), "Set MARKETING_TEST_ORIGIN or REPLIT_DEV_DOMAIN");
const debugPort = process.env.MARKETING_DEBUG_PORT || "9223";
const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => ws.once("open", resolve));
let id = 0;
const pending = new Map();
let submissionMode = "error";
let submissions = 0;
let submittedBody = "";
const priceFixture = {
  player_pro_monthly: { id: "test-pro-month", amount: 6.49, currency: "usd" },
  player_pro_yearly: { id: "test-pro-year", amount: 59.88, currency: "usd" },
  commissioner_monthly: { id: "test-comm-month", amount: 19.49, currency: "usd" },
  commissioner_yearly: { id: "test-comm-year", amount: 179.88, currency: "usd" },
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const requestId = ++id;
  pending.set(requestId, { resolve, reject });
  ws.send(JSON.stringify({ id: requestId, method, params }));
});
ws.on("message", async raw => {
  const message = JSON.parse(raw);
  if (message.id) {
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result);
    return;
  }
  if (message.method !== "Fetch.requestPaused") return;
  const { requestId, request } = message.params;
  let status = 200;
  let payload;
  if (request.url.endsWith("/api/stripe/prices")) payload = priceFixture;
  else if (request.url.endsWith("/api/referral/apply")) {
    submissions++;
    submittedBody = request.postData || "";
    status = submissionMode === "error" ? 400 : 200;
    payload = submissionMode === "error" ? { message: "Test application error" } : { success: true };
  } else if (request.method === "POST") payload = { success: true };
  else {
    await send("Fetch.continueRequest", { requestId });
    return;
  }
  await send("Fetch.fulfillRequest", {
    requestId, responseCode: status,
    responseHeaders: [{ name: "Content-Type", value: "application/json" }],
    body: Buffer.from(JSON.stringify(payload)).toString("base64"),
  });
});
ws.on("close", () => {
  for (const request of pending.values()) request.reject(new Error("Test browser disconnected before verification finished"));
  pending.clear();
});
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}
async function wait(expression, label) {
  for (let tries = 0; tries < 100; tries++) {
    if (await evaluate(expression)) return;
    await sleep(250);
  }
  throw new Error(`Timeout: ${label}`);
}
async function navigate(path) {
  await send("Page.navigate", { url: origin + path });
  await wait(`location.pathname === ${JSON.stringify(path)} && !!document.querySelector('main h1')`, path);
  await sleep(350);
}
const text = () => evaluate("document.body.innerText");
try {
  await send("Page.enable");
  await send("Page.bringToFront");
  await send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await send("Runtime.enable");
  await send("Fetch.enable", { patterns: [{ urlPattern: origin + "/*", requestStage: "Request" }] });
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  for (const path of ["/", "/features", "/pricing", "/about", "/referral-program"]) {
    await navigate(path);
    assert(!(await text()).includes("Preview only"));
    const missing = await evaluate("Array.from(document.querySelectorAll('img')).filter(i=>i.complete&&!i.naturalWidth).map(i=>i.src)");
    assert.deepEqual(missing, [], `${path}: missing images`);
    const links = await evaluate("Array.from(document.querySelectorAll('header nav a')).map(a=>a.getAttribute('href'))");
    for (const href of ["/features", "/pricing", "/about", "/referral-program"]) assert(links.includes(href), `${path}: ${href} missing`);
    console.log(`PASS ${path}: renders with working navigation and images`);
  }
  await navigate("/");
  await evaluate("document.querySelector('.rs-hero-actions button').click()");
  await wait("location.pathname === '/get-started'", "signup route");
  await navigate("/");
  await evaluate("document.querySelectorAll('.rs-hero-actions button')[1].click()");
  await wait("location.pathname === '/login'", "login route");
  console.log("PASS homepage signup and login navigation");

  await navigate("/pricing");
  await wait("document.body.innerText.includes('$6.49')", "monthly pricing");
  assert((await text()).includes("$19.49"));
  await evaluate("document.querySelector('.pp-billing-control button').click()");
  await wait("document.body.innerText.includes('$4.99')", "annual monthly-equivalent pricing");
  assert((await text()).includes("$59.88 billed annually."));
  assert((await text()).includes("$179.88 billed annually."));
  console.log("PASS live pricing query and annual billing calculations");

  if (!process.env.MARKETING_SKIP_BRACKET) {
  await navigate("/features");
  await evaluate("document.querySelector('.rp-bracket-animation').scrollIntoView({block:'center'})");
  await sleep(1000);
  assert.equal(await evaluate("document.querySelectorAll('.rp-bracket-animation span').length > 0"), true);
  await wait("document.querySelector('.rp-bracket-animation').innerText.includes('Champions')", "champion animation");
  await sleep(700);
  const connectors = await evaluate("Array.from(document.querySelectorAll('.rp-bracket-animation svg path')).map(p=>({opacity:getComputedStyle(p).opacity,stroke:p.getAttribute('stroke'),style:p.getAttribute('style')}))");
  assert(connectors.every(p => Number(p.opacity) >= 0.99), JSON.stringify(connectors));
  console.log("PASS original bracket plays through champion reveal and connector completion");
  }

  await navigate("/referral-program");
  await evaluate(`(() => {
    const set = (selector,value) => {
      const el=document.querySelector(selector);
      Object.getOwnPropertyDescriptor(el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(el,value);
      el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));
    };
    set('.partner-form input[placeholder="Greater Cleveland Hockey Association"]','Test Hockey Organization');
    set('.partner-form input[placeholder="Your name"]','Test Contact');
    set('.partner-form input[type=email]','TEST@example.invalid');
    set('.partner-form select','Recreation League');
  })()`);
  await evaluate("document.querySelector('.partner-form').requestSubmit()");
  await wait("document.body.innerText.includes('Test application error')", "partner error");
  submissionMode = "success";
  await evaluate("document.querySelector('.partner-form').requestSubmit()");
  await wait("document.body.innerText.includes('Check your email')", "partner success");
  assert.equal(submissions, 2);
  if (submittedBody) assert(submittedBody.includes("test@example.invalid"), "Email normalized");
  console.log("PASS partner application error, retry, email confirmation, and normalization (requests intercepted)");

  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  for (const path of ["/", "/features", "/pricing", "/about", "/referral-program"]) {
    await navigate(path);
    assert(await evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), `${path}: horizontal overflow`);
    await evaluate("document.querySelector('header button[aria-expanded]').click()");
    assert(await evaluate("!!document.querySelector('nav[aria-label=\"Mobile navigation\"]')"), `${path}: mobile menu`);
    console.log(`PASS ${path}: phone layout and mobile menu`);
  }
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await navigate("/features");
  await evaluate("document.querySelector('.rp-bracket-animation').scrollIntoView({block:'center'})");
  await wait("document.querySelector('.rp-bracket-animation').innerText.includes('Champions')", "reduced-motion bracket");
  console.log("PASS reduced-motion bracket reaches final state");
} finally {
  ws.close();
  await fetch(`http://127.0.0.1:${debugPort}/json/close/${target.id}`);
}
