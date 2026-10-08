import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { transformSync } from "esbuild";

const folder = "artifacts/mockup-sandbox/src/components/mockups/roster-home/";
const source = readFileSync(`${folder}ScrollStory.tsx`, "utf8");
const require = createRequire(new URL("../../../../package.json", import.meta.url));
const React = require("react");
const compiled = transformSync(source.replace('import "./ScrollStory.css";', ""),
  { loader: "tsx", jsx: "automatic", format: "cjs" }).code;

function elements(node: any): any[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  return [node, ...elements(node.props?.children)];
}
function fixture() {
  const states: any[] = [], refs: any[] = [], effects: (() => (() => void))[] = [];
  let stateIndex = 0, refIndex = 0, effectIndex = 0;
  const events = new Map<string, Set<() => void>>();
  const frames = new Map<number, () => void>();
  const preferenceEvents = new Set<() => void>();
  const media = { matches: false, addEventListener: (_: string, cb: () => void) => preferenceEvents.add(cb),
    removeEventListener: (_: string, cb: () => void) => preferenceEvents.delete(cb) };
  let frameId = 0;
  const window = {
    innerHeight: 800, location: { hash: "" }, matchMedia: () => media,
    addEventListener: (name: string, cb: () => void) => {
      if (!events.has(name)) events.set(name, new Set());
      events.get(name)!.add(cb);
    },
    removeEventListener: (name: string, cb: () => void) => events.get(name)?.delete(cb),
    requestAnimationFrame: (cb: () => void) => { frames.set(++frameId, cb); return frameId; },
    cancelAnimationFrame: (id: number) => frames.delete(id),
  };
  const nodes: Record<string, any> = {};
  const document = { getElementById: (id: string) => nodes[id] };
  const module = { exports: {} as any };
  new Function("require", "exports", "module", "window", "document", compiled)(
    (name: string) => {
      if (name === "react") return { ...React,
        useState: (initial: any) => {
          const index = stateIndex++;
          if (!(index in states)) states[index] = initial;
          return [states[index], (next: any) => { states[index] = next; }];
        },
        useRef: (initial: any) => refs[refIndex++] ?? (refs[refIndex - 1] = { current: initial }),
        useEffect: (effect: any) => { const index = effectIndex++; effects[index] ??= effect; },
      };
      // Icon geometry is verified by the real browser; this fixture substitutes
      // only the package's SVG functions to stay within one React runtime.
      if (name === "react-icons/si") return {
        SiAppstore: () => React.createElement("svg"), SiGoogleplay: () => React.createElement("svg"),
      };
      return require(name);
    }, module.exports, module, window, document,
  );
  const render = () => {
    stateIndex = refIndex = effectIndex = 0;
    return module.exports.default();
  };
  const first = render();
  const rows = [0, 1].map(() => ({ style: { transform: "" }, scrollWidth: 7200,
    top: 800, getBoundingClientRect() { return { top: this.top }; } }));
  const track = { style: { transform: "" }, getBoundingClientRect: () => ({ top: 1000 }) };
  for (const node of elements(first)) {
    if (node.props?.id) nodes[node.props.id] = { scrollIntoView: (options: any) => { nodes[node.props.id].lastScroll = options; } };
    if (node.props?.ref) {
      const value = {
        top: node.props.id === "team" ? 1200 : 4000,
        height: node.props.className === "rs-benefit-scene" ? 1440 : 1360,
        getBoundingClientRect() { return { top: this.top, height: this.height }; },
        querySelectorAll: () => rows, querySelector: () => track,
      };
      node.props.ref.current = value;
      if (node.props.id) nodes[node.props.id] = value;
      if (node.props.className === "rs-benefit-scene") nodes.benefit = value;
    }
  }
  const cleanups = effects.map(effect => effect());
  const scroll = () => {
    events.get("scroll")?.forEach(cb => cb());
    for (const [id, callback] of [...frames]) { frames.delete(id); callback(); }
  };
  return { render, nodes, rows, scroll, media,
    reduce: () => { media.matches = true; preferenceEvents.forEach(cb => cb()); },
    cleanup: () => cleanups.forEach(cb => cb()),
    events, frames, preferenceEvents };
}

test("words brighten from their own section, independent of total page length", () => {
  const f = fixture();
  const lit = () => elements(f.render()).filter(node => node.props?.className === "rs-word is-lit").length;
  assert.equal(lit(), 0);
  f.nodes.team.top = -900;
  f.scroll();
  assert.equal(lit(), 18);
  assert.ok(elements(f.render()).some(node => node.props?.children === "GROUP CHAT"));
  f.nodes.benefit.top = -240;
  f.scroll();
  assert.ok(elements(f.render()).some(node => node.props?.children === "CLEAR LINEUP"));
  f.nodes.benefit.top = -900;
  f.scroll();
  assert.ok(elements(f.render()).some(node => node.props?.children === "GAME ON"));
});

test("patch rows move in opposite directions without exposing an empty leading edge", () => {
  const f = fixture();
  const before = f.rows.map(row => parseFloat(row.style.transform.split("(")[1]));
  f.rows.forEach(row => { row.top = 300; });
  f.scroll();
  const after = f.rows.map(row => parseFloat(row.style.transform.split("(")[1]));
  assert.ok(after[0] > before[0] && after[1] < before[1]);
  assert.ok(after.every(value => value < 0));
  f.reduce();
  assert.ok(f.rows.every(row => row.style.transform === ""));
  assert.equal(elements(f.render()).filter(node => node.props?.className === "rs-word is-lit").length, 18);
  f.cleanup();
  assert.ok([...f.events.values()].every(set => set.size === 0));
  assert.equal(f.preferenceEvents.size, 0);
  assert.equal(f.frames.size, 0);
});

test("trivia feedback, question reset, and preview-only signup work locally", () => {
  const f = fixture();
  const button = (text: string) => elements(f.render()).find(node =>
    node.type === "button" && (node.props.children === text ||
      (Array.isArray(node.props.children) && node.props.children[0] === text)));
  button("Montreal Hockey Club").props.onClick();
  assert.ok(elements(f.render()).some(node => node.props?.className === "rs-answer is-correct"));
  button("Next demo question ").props.onClick();
  assert.ok(!elements(f.render()).some(node => node.props?.className?.includes("rs-answer is-correct")));
  button("Blackhawks").props.onClick();
  assert.ok(elements(f.render()).some(node => node.props?.className === "rs-answer is-incorrect"));
  button("Get started ").props.onClick();
  assert.ok(elements(f.render()).some(node => node.props?.className === "rs-notice"));
  for (const forbidden of ["fetch(", "localStorage", "/api/"]) assert.ok(!source.includes(forbidden));
});

test("all local artwork exists and new files remain independent from app imports", () => {
  for (const node of elements(fixture().render()).filter(node => node.type === "img")) {
    assert.ok(existsSync(`artifacts/mockup-sandbox/public${node.props.src.replace("/__mockup", "")}`), node.props.src);
  }
  assert.ok(!source.includes("@/"));
  const css = readFileSync(`${folder}ScrollStory.css`, "utf8");
  assert.ok(css.includes("prefers-reduced-motion"));
  assert.ok(css.includes(":focus-visible"));
});
