import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { transformSync } from "esbuild";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

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

test("only hockey and adult-league pages receive fun promotion", () => {
  const sport = readFileSync("client/src/pages/SportLanding.tsx", "utf8");
  const segment = readFileSync("client/src/pages/SegmentLanding.tsx", "utf8");
  assert.match(sport, /sport === 'hockey' && \([\s\S]*?<FunFeaturesNudge/);
  assert.match(segment, /segment === 'for-adult-leagues' && \([\s\S]*?<FunFeaturesNudge/);
  assert.ok(source.includes('href="/features#fun-features"'));
});

test("hero promotes all three features and both public pricing lists explain access", () => {
  const home = readFileSync("client/src/pages/Landing.tsx", "utf8");
  const pricing = readFileSync("client/src/pages/Pricing.tsx", "utf8");
  assert.match(home, /href="#fun-features"/);
  assert.ok(home.includes("Earn patches. Track post-game beers. Play daily trivia."));
  for (const page of [home, pricing]) {
    for (const benefit of ["Daily Hockey Trivia", "Beer Counter (Adult Players)",
      "Earn Patch Progress", "Trophy Case & Patch Artwork (21+)"]) assert.ok(page.includes(benefit));
  }
  assert.ok(pricing.includes("verified age of 21 or older"));
});

test("new styles include responsive, focus-visible, and reduced-motion treatment", () => {
  const css = readFileSync("client/src/components/FunFeaturesShowcase.css", "utf8");
  assert.ok(css.includes("max-width: 760px"));
  assert.ok(css.includes("max-width: 480px"));
  assert.ok(css.includes(":focus-visible"));
  assert.ok(css.includes("prefers-reduced-motion: reduce"));
});
