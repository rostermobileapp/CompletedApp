import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { transformSync } from "esbuild";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { marketingDestination, WEBSITE_ORIGIN } from "@shared/appWebPolicy";

const source = readFileSync("client/src/components/FunFeaturesShowcase.tsx", "utf8");
const require = createRequire(import.meta.url);

// Compile the real component, substituting only its local state hook. No app
// routes, authentication, or API responses are bypassed.
function fixture() {
  let answer: string | null = null;
  const module = { exports: {} as Record<string, any> };
  const compiled = transformSync(source.replace('import "./FunFeaturesShowcase.css";', ""), {
    loader: "tsx", format: "cjs", jsx: "automatic",
  }).code;
  new Function("require", "exports", "module", compiled)(
    (name: string) => name === "react"
      ? { ...React, useState: () => [answer, (next: string) => { answer = next; }] }
      : require(name),
    module.exports, module,
  );
  return {
    tree: () => module.exports.default({}),
    html: () => renderToStaticMarkup(module.exports.default({})),
  };
}

function elements(node: any): any[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  return [node, ...elements(node.props?.children)];
}

test("showcase labels previews and accurately explains free and paid access", () => {
  const html = fixture().html();
  for (const copy of ["More than game night.", "Illustrative preview", "no live total",
    "not today", "included on Free", "Free to play", "age 21+", "January 1"]) {
    assert.ok(html.includes(copy), `Missing ${copy}`);
  }
  assert.equal((html.match(/<article/g) ?? []).length, 3);
  assert.equal((html.match(/<button/g) ?? []).length, 4);
  assert.ok(!source.includes("fetch("));
  assert.ok(!source.includes("localStorage"));
});

test("sample answers update only local feedback, including correct and incorrect states", () => {
  const preview = fixture();
  const choose = (answer: string) => {
    const button = elements(preview.tree()).find(node =>
      node.type === "button" && elements(node).some(child => child.props?.children === answer));
    assert.ok(button, `Missing answer ${answer}`);
    button.props.onClick();
  };
  choose("Hart Trophy");
  assert.match(preview.html(), /Not this one/);
  assert.match(preview.html(), /is-incorrect/);
  choose("Art Ross Trophy");
  assert.match(preview.html(), /That’s it/);
  assert.match(preview.html(), /is-correct/);
  assert.match(preview.html(), /role="status"/);
  assert.match(preview.html(), /aria-pressed="true"/);
  assert.ok(!fixture().html().includes('role="status"'), "fresh preview must not retain a previous answer");
});

test("every showcase image uses an existing local asset and has alt text", () => {
  const images = elements(fixture().tree()).filter(node => node.type === "img");
  assert.equal(images.length, 3);
  for (const image of images) {
    assert.ok(image.props.alt);
    assert.ok(existsSync(`client/public${image.props.src}`), image.props.src);
  }
});

// Public-page placement belongs to the independent WEBSITE now. Keep all
// component behavior/accessibility/asset tests above; test the APP boundary here.
test("hockey and adult-league promotions delegate to the independent website", () => {
  for (const route of ["/hockey", "/for-adult-leagues"]) {
    assert.equal(marketingDestination(route, "?ref=FIXTURE"), `${WEBSITE_ORIGIN}${route}?ref=FIXTURE`);
  }
  assert.ok(source.includes('href="/features#fun-features"'));
});

test("APP no longer imports promotional pages or the retained historical showcase", () => {
  const app = readFileSync("client/src/App.tsx", "utf8");
  for (const module of ["FunFeaturesShowcase", "marketing/", "pages/Landing", "pages/Pricing", "SportLanding", "SegmentLanding"]) {
    assert.ok(!app.includes(module), module);
  }
  assert.equal(marketingDestination("/pricing"), `${WEBSITE_ORIGIN}/pricing`);
  assert.equal(marketingDestination("/features"), `${WEBSITE_ORIGIN}/features`);
});

test("new styles include responsive, focus-visible, and reduced-motion treatment", () => {
  const css = readFileSync("client/src/components/FunFeaturesShowcase.css", "utf8");
  assert.ok(css.includes("max-width: 760px"));
  assert.ok(css.includes("max-width: 480px"));
  assert.ok(css.includes(":focus-visible"));
  assert.ok(css.includes("prefers-reduced-motion: reduce"));
});
