/** Real Stripe card/dialog source in an isolated browser fixture; no API calls. */
import assert from "node:assert/strict";
import http from "node:http";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { build } from "esbuild";
import { chromium } from "playwright-core";

const output = "generated-artifacts/stripe-unlink";
await mkdir(output, { recursive: true });
const script = await build({
  stdin: {
    contents: `
      import React,{useState} from 'react';
      import {createRoot} from 'react-dom/client';
      import {OrganizerStripeSetupCard,OrganizerStripeUnlinkDialog} from './client/src/components/OrganizerStripeSetupCard';
      function Fixture(){
        const [connected,setConnected]=useState(true),[open,setOpen]=useState(false),[count,setCount]=useState(0);
        const ready=connected&&!location.search.includes('incomplete');
        return <><OrganizerStripeSetupCard eligible ready={ready} connected={connected}
          pending={false} collectionEnabled={false} onSetup={()=>{}} onManage={()=>{}}
          onUnlink={()=>setOpen(true)}/>
          <OrganizerStripeUnlinkDialog open={open} pending={false} onOpenChange={setOpen}
            onConfirm={()=>{setCount(v=>v+1);setConnected(false);setOpen(false);}}/>
          <output data-testid="unlink-count">{count}</output></>;
      }
      createRoot(document.getElementById('root')).render(<Fixture/>);
    `,
    resolveDir: process.cwd(), loader: "tsx",
  },
  bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
});
const css = (await Promise.all((await readdir("dist/public/assets"))
  .filter(name => name.endsWith(".css"))
  .map(name => readFile(`dist/public/assets/${name}`, "utf8")))).join("\n");
const server = http.createServer((req, res) => {
  if (req.url === "/fixture.js") {
    res.setHeader("Content-Type", "application/javascript");
    return res.end(script.outputFiles[0].text);
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(`<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head>
    <body style="margin:0;padding:24px;background:#09090b;color:white"><div id="root"></div><script src="/fixture.js"></script></body></html>`);
});
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const address = server.address() as { port: number };
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({
  executablePath: "/repl/tools/bin/chromium", args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  for (const width of [320, 402, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 874 } });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(origin);
    const manage = page.getByTestId("button-manage-stripe");
    await manage.waitFor();
    const headingBox = await page.getByRole("heading", { name: "Stripe Confirmed" }).boundingBox();
    const buttonBox = await manage.boundingBox();
    assert.ok(headingBox && buttonBox);
    assert.ok(Math.abs((headingBox.y + headingBox.height / 2) - (buttonBox.y + buttonBox.height / 2)) < 3);
    assert.ok(buttonBox.x + buttonBox.width <= width - 24);
    await manage.click();
    await page.getByTestId("menu-unlink-stripe").waitFor();
    await page.getByRole("menu").evaluate(async element => {
      await Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {})));
    });
    if (width === 320) await page.screenshot({ path: `${output}/mobile-menu.jpg` });
    await page.getByTestId("menu-unlink-stripe").click();
    await page.getByRole("alertdialog").waitFor();
    await page.getByRole("alertdialog").evaluate(async element => {
      await Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {})));
    });
    const dialogBox = await page.getByRole("alertdialog").boundingBox();
    assert.ok(dialogBox && dialogBox.width >= Math.min(width - 48, 512) - 1);
    assert.equal(await page.getByTestId("unlink-count").innerText(), "0");
    if (width === 320) await page.screenshot({ path: `${output}/mobile-confirmation.jpg` });
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(await manage.count(), 1);
    assert.equal(await page.getByTestId("unlink-count").innerText(), "0");
    await manage.click();
    await page.getByTestId("menu-unlink-stripe").click();
    await page.getByTestId("button-confirm-unlink-stripe").click();
    await page.getByTestId("button-connect-stripe").waitFor();
    await page.getByRole("alertdialog").waitFor({ state: "hidden" });
    assert.equal(await page.getByTestId("unlink-count").innerText(), "1");
    assert.equal(await manage.count(), 0);
    assert.equal(await page.getByRole("alertdialog").count(), 0);

    await page.goto(`${origin}/?incomplete`);
    await page.getByTestId("button-connect-stripe").click();
    await page.getByTestId("menu-unlink-stripe").waitFor();
    assert.equal(await page.getByTestId("menu-open-stripe").innerText(), "Continue setup");
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(JSON.stringify({
    widths: [320, 402, 1280], singleLineVerified: true, unlinkMenuVisible: true,
    confirmationRequired: true, cancelPreservesConnection: true, confirmedUnlinkReturnsToSetup: true,
    incompleteAccountCanUnlink: true, sourceDerivedFixture: true, liveAccountsChanged: false,
  }));
} finally {
  await browser.close();
  await new Promise<void>(resolve => server.close(() => resolve()));
}
