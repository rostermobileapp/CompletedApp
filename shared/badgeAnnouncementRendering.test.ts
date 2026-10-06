import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { build } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Bundle the real component while isolating unrelated auth/socket imports.
const bundle = await build({
  entryPoints: ["client/src/components/BadgeEarnedHost.tsx"],
  bundle: true,
  write: false,
  platform: "node",
  format: "cjs",
  jsx: "automatic",
  external: ["react", "react/jsx-runtime", "lucide-react", "@tanstack/react-query"],
  plugins: [{
    name: "announcement-render-fixtures",
    setup(builder) {
      const stubs: Record<string, string> = {
        "@/lib/queryClient": "export const getImageUrl = path => path; export const apiRequest = () => Promise.resolve();",
        "@/context/WebSocketContext": "export const useWebSocket = () => ({});",
        "wouter": "export const useLocation = () => ['', () => {}];",
        "@/assets/badge-confetti.webm": "export default '/confetti.webm';",
      };
      builder.onResolve({ filter: /.*/ }, (args) =>
        args.path in stubs ? { path: args.path, namespace: "announcement-stub" } : undefined);
      builder.onLoad({ filter: /.*/, namespace: "announcement-stub" }, (args) => ({
        contents: stubs[args.path],
        loader: "js",
      }));
    },
  }],
});
const module = { exports: {} as any };
new Function("require", "module", "exports", bundle.outputFiles[0].text)(
  createRequire(`${process.cwd()}/package.json`), module, module.exports,
);
const { BadgeEarnedAnnouncement } = module.exports;
const badge = {
  name: "Beer Me",
  description: "A beer milestone.",
  imagePath: "/private-earned-tier.png",
  achievementType: "tiered",
};

function render(artworkLocked?: boolean) {
  const previousWindow = (globalThis as any).window;
  (globalThis as any).window = { matchMedia: () => ({ matches: false }) };
  try {
    return renderToStaticMarkup(createElement(BadgeEarnedAnnouncement, {
      badge,
      payload: { tier: "bronze" },
      ...(artworkLocked === undefined ? {} : { artworkLocked }),
      onDismiss: () => {},
      onViewTrophyCase: () => {},
    }));
  } finally {
    (globalThis as any).window = previousWindow;
  }
}

test("free celebration renders a lock and upgrade copy, never the real image", () => {
  const html = render(true);
  assert.match(html, /Patch artwork locked/);
  assert.match(html, /Player Pro/);
  assert.match(html, /View in Trophy Case/);
  assert.match(html, /Beer Me/);
  assert.match(html, /BRONZE/);
  assert.match(html, /confetti\.webm/);
  assert.doesNotMatch(html, /private-earned-tier\.png|<img/);
});

test("paid celebration keeps earned tier artwork, confetti and Trophy Case action", () => {
  const html = render(false);
  assert.match(html, /<img[^>]+private-earned-tier\.png/);
  assert.match(html, /confetti\.webm/);
  assert.match(html, /View in Trophy Case/);
  assert.doesNotMatch(html, /Patch artwork locked|Player Pro/);
});

test("existing paid Trophy Case celebration previews retain artwork by default", () => {
  assert.match(render(), /<img[^>]+private-earned-tier\.png/);
});
