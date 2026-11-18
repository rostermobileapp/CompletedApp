/**
 * Copy-only exporter. Never removes APP files or copies secrets.
 * Run: npx tsx scripts/export-website.ts
 * The resulting folder is independent; this generator is not a runtime dependency.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import ts from "typescript";
import { localFonts } from "./website-export/localFonts";

const root = process.cwd();
const output = path.join(root, "generated-artifacts/website-export");
const templates = path.join(root, "scripts/website-export/templates");
const packageSource = JSON.parse(await fs.readFile("package.json", "utf8"));
const copied = new Map<string, { source: string; destination: string; bytes: number; sha256: string }>();
const visited = new Set<string>();
const packages = new Set(["react", "react-dom", "wouter", "@vercel/analytics"]);
const generated = new Map<string, string>();
const priceSource = await fs.readFile("client/src/components/marketing/PricingPage.tsx", "utf8");
const priceEntries = Array.from(priceSource.matchAll(/\b(player_pro_monthly|player_pro_yearly|commissioner_monthly|commissioner_yearly):\s*([\d.]+)/g));
if (priceEntries.length !== 4) throw new Error("Review the public pricing snapshot: expected exactly four locally displayed plan amounts");
generated.set("src/content/pricing.json", JSON.stringify(Object.fromEntries(priceEntries.map(m => [m[1], { amount: Number(m[2]), currency: "USD" }])), null, 2));
const oldPrerender = await fs.readFile("scripts/prerender-public-pages.ts", "utf8");
const oldAst = ts.createSourceFile("prerender.ts", oldPrerender, ts.ScriptTarget.Latest, true);
const schemaFunction = oldAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "structuredData");
if (!schemaFunction) throw new Error("Existing structured data renderer was not found");
generated.set("scripts/structuredData.ts", `const SITE_ORIGIN="https://www.rosterhockey.com";\nexport ${schemaFunction.getText(oldAst)}\n`);
const exists = async (file: string) => fs.access(file).then(() => true, () => false);
const localizeFonts = localFonts(write);
async function write(file: string, content: string | Uint8Array, source = "standalone template") {
  const dest = path.join(output, file);
  if (!dest.startsWith(`${output}/`)) throw new Error(`Unsafe export path: ${file}`);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, content);
  const bytes = Buffer.from(content);
  copied.set(file, { source, destination: file, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
}
function sourceFor(file: string) {
  if (file.startsWith("src/")) return `client/${file}`;
  if (file.startsWith("assets/")) return file.replace(/^assets\//, "attached_assets/");
  return file;
}
function websitePartners(source: string) {
  const start = source.indexOf('<main className="rp-page partner-page">');
  const end = source.indexOf('<section className="partner-apply" id="apply">');
  if (start < 0 || end < start) throw new Error("Partner source changed: review application boundary before exporting");
  const marketing = source.slice(start, end).replace("{!applicationOnly && <>", "").replace("</>}", "")
    .replace('href="#apply"', 'href={`${APP_SITE_ORIGIN}/referral-program/apply`}');
  return `import {useState} from "react";
import {ArrowRight,Check,Minus,Plus} from "lucide-react";
import {RosterPageNav,RosterPageFooter} from "./RosterPageNav";
import {useSeo} from "@/hooks/useSeo";
import {APP_SITE_ORIGIN} from "@/lib/seoMetadata";
import "./PartnersPage.css";
export function PartnersPage(){
useSeo({title:"Community Partner Program | RosterHockey",description:"Partner with RosterHockey to support your hockey community through our referral program. Apply online and help teams stay connected."});
const [referrals,setReferrals]=useState(300);const donation=Math.round(referrals*5.51*3*0.1);
return (${marketing}<section className="partner-apply" id="apply"><div className="partner-container partner-apply-layout"><div><span className="rp-kicker">Make the next season count</span><h2 className="rp-title rp-title-sm">Apply to become<br/>a partner.</h2><p>Takes about three minutes. We review every application personally.</p></div><div className="partner-form"><p>Continue to the secure RosterHockey application. Uploads, email verification and your application stay with the app.</p><a className="partner-button" href={\`\${APP_SITE_ORIGIN}/referral-program/apply\`}>Apply to become a partner <ArrowRight size={16}/></a></div></div></section><RosterPageFooter/></main>);}
`;
}
function transform(file: string, source: string) {
  if (file === "src/components/marketing/PartnersPage.tsx") source = websitePartners(source);
  if (file === "src/components/marketing/PricingPage.tsx") {
    source = source.replace(/const prices = \{[\s\S]*?\} as const;/, 'const prices = Object.fromEntries(Object.entries(publicPrices).map(([key,value])=>[key,value.amount])) as Record<keyof typeof publicPrices,number>;');
    source = 'import publicPrices from "@/content/pricing.json";\n' + source;
  }
  if (file === "src/components/MarketingLayout.tsx") source = source
    .replace(/^import \{ useAuth \} from ['"]@\/hooks\/useAuth['"];?\r?\n/m, "")
    .replace("const { isAuthenticated } = useAuth();", "const isAuthenticated = false;");
  if (file === "src/components/marketing/useMarketingVisit.ts") return "// WEBSITE analytics is owned by the centrally mounted Vercel Web Analytics component.\nexport function useMarketingVisit() {}\n";
  if (file === "src/hooks/useIosPlatform.ts") return `import {useState,useEffect} from "react";\nexport function useIsIosDevice(){const [ios,setIos]=useState(false);useEffect(()=>setIos(/iPad|iPhone|iPod/.test(navigator.userAgent)),[]);return ios;}\n`;
  if (file === "tailwind.config.ts") source = source.replaceAll("./client/index.html", "./index.html").replaceAll("./client/src/", "./src/");
  // Motion's SVG pathLength typing conflicts with the DOM SVG attribute type.
  // Assertions only: retain the exact original animation targets and timing.
  if (file === "src/components/marketing/_shared/AnimatedBracket.tsx") source = source
    .replace('initial={reduced ? false : { pathLength: 0, opacity: 0 }}', 'initial={reduced ? false : ({ pathLength: 0, opacity: 0 } as unknown as import("framer-motion").Target)}')
    .replace('animate={stage >= trig ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}', 'animate={(stage >= trig ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }) as unknown as import("framer-motion").TargetAndTransition}');
  // Keep presentation, but route account actions to APP, not a local fake login.
  const prior = source;
  source = source.replace(/\b(?:navigate|setLocation)\(['"](\/(?:login|get-started|signup))['"]\)/g, (_, route) => `openAppEntry("${route}")`)
    .replace(/href=(["'])(\/(?:login|get-started|signup))\1/g, (_, _quote, route) => `href="https://www.roster-app.com${route}"`);
  if (source.includes("openAppEntry(") && source !== prior) source = `import {openAppEntry} from "@/lib/websiteNavigation";\n${source}`;
  if (file.startsWith("src/") && /(?:\bfetch\s*\(|\/api\/|@supabase|useAuth\b|RevenueCat|OneSignal|NativelyPurchases)/.test(source)) {
    throw new Error(`APP runtime dependency remains in website source: ${file}`);
  }
  return source;
}
async function resolveModule(from: string, spec: string) {
  let base: string;
  if (spec.startsWith("@/")) base = `src/${spec.slice(2)}`;
  else if (spec.startsWith("@assets/")) base = `assets/${spec.slice(8)}`;
  else if (spec.startsWith("@shared/")) base = `shared/${spec.slice(8)}`;
  else if (spec.startsWith(".")) base = path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  else {
    if (!spec.startsWith("node:")) packages.add(spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0]);
    return;
  }
  if (base.startsWith("../") || path.isAbsolute(base)) throw new Error(`Parent/absolute import in ${from}: ${spec}`);
  for (const candidate of [base, `${base}.tsx`, `${base}.ts`, `${base}.js`, `${base}/index.tsx`, `${base}/index.ts`]) {
    const template = path.join(templates, candidate);
    const original = path.join(root, sourceFor(candidate));
    if (generated.has(candidate) || (await exists(template) && (await fs.stat(template)).isFile()) || (await exists(original) && (await fs.stat(original)).isFile())) {
      await visit(candidate); return;
    }
  }
  throw new Error(`Unresolved independent module ${spec} in ${from}`);
}
async function publicAssets(source: string) {
  const pattern = /["'(]((?:\/)[^"'()\s]*?\.(?:png|jpe?g|webp|svg|gif|mp4|webm|woff2?|ttf|ico|pdf))(?:[?#][^"'()\s]*)?["')]/gi;
  for (const match of source.matchAll(pattern)) {
    const file = decodeURIComponent(match[1]);
    if (file.includes("${")) throw new Error(`Review dynamically named public asset: ${file}`);
    if (copied.has(`public${file}`)) continue;
    const original = path.join(root, "client/public", file);
    if (!(await exists(original))) throw new Error(`Public asset not found: ${file}`);
    await write(`public${file}`, await fs.readFile(original), `client/public${file}`);
  }
}
async function copyPublicMedia(directory: string) {
  const absolute = path.join(root, "client/public", directory);
  for (const entry of await fs.readdir(absolute, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error("Public media symlinks require review before export");
    const file = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) await copyPublicMedia(file);
    else if (/\.(?:png|jpe?g|webp|svg|gif|mp4|webm|woff2?|ttf|ico|pdf)$/i.test(entry.name)) {
      await write(`public/${file}`, await fs.readFile(path.join(absolute, entry.name)), `client/public/${file}`);
    }
  }
}
async function visit(file: string) {
  if (visited.has(file)) return;
  visited.add(file);
  const template = path.join(templates, file);
  const original = sourceFor(file);
  const isTemplate = await exists(template);
  const data = generated.has(file) ? Buffer.from(generated.get(file)!) : await fs.readFile(isTemplate ? template : path.join(root, original));
  if (!/\.(?:tsx?|jsx?|css|html|mjs)$/.test(file)) { await write(file, data, isTemplate ? path.relative(root, template) : original); return; }
  let source = isTemplate ? data.toString() : transform(file, data.toString());
  if (file.endsWith(".css")) source = await localizeFonts(source);
  await write(file, source, isTemplate ? path.relative(root, template) : original);
  await publicAssets(source);
  if (/\.(?:tsx?|jsx?|mjs)$/.test(file)) {
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const imports: string[] = [];
    function scan(node: ts.Node) {
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require")) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) imports.push(node.arguments[0].text);
      ts.forEachChild(node, scan);
    }
    scan(ast);
    for (const spec of imports) await resolveModule(file, spec);
  }
  if (file.endsWith(".css")) for (const match of source.matchAll(/@import\s+["']([^"']+)["']/g)) await resolveModule(file, match[1]);
}
// All output is generated and ignored. Existing export files are never removed.
await fs.mkdir(output, { recursive: true });
for (const entry of ["src/main.tsx", "src/render.tsx", "src/lib/websiteNavigation.ts", "index.html", "vite.config.ts", "tailwind.config.ts", "postcss.config.js", "scripts/prerender.ts", "scripts/serve.mjs", "README.md", "package-lock.json"]) await visit(entry);
// The homepage constructs image("badges/${slug}/tier-1.webp") and other media
// paths. Copy these closed, public marketing namespaces, not arbitrary uploads.
await copyPublicMedia("marketing");
await copyPublicMedia("images/line-combos");
const versions = { ...packageSource.dependencies, ...packageSource.devDependencies };
const toolNames = new Set(["vite", "@vitejs/plugin-react", "typescript", "tsx", "tailwindcss", "postcss", "autoprefixer", "tailwindcss-animate", "@tailwindcss/typography", "@types/react", "@types/react-dom", "@types/node"]);
const devDependencies: Record<string, string> = {};
for (const name of toolNames) devDependencies[name] = versions[name] || (() => { throw new Error(`Missing pinned tool ${name}`); })();
const dependencies: Record<string, string> = {};
for (const name of packages) if (!toolNames.has(name)) {
  if (/supabase|stripe|revenuecat|onesignal|drizzle|^pg$|anthropic/i.test(name)) throw new Error(`Forbidden website dependency: ${name}`);
  dependencies[name] = name === "@vercel/analytics" ? "^1.5.0" : versions[name] || (() => { throw new Error(`Unknown website dependency ${name}`); })();
}
await write("package.json", JSON.stringify({
  name: "rosterhockey-website", version: "1.0.0", private: true, type: "module", engines: { node: ">=20" },
  scripts: { dev: "vite --host 0.0.0.0 --port 5000", build: "vite build && tsx scripts/prerender.ts", start: "node scripts/serve.mjs", check: "tsc --noEmit" },
  dependencies, devDependencies,
}, null, 2) + "\n");
await write("tsconfig.json", JSON.stringify({ compilerOptions: { target: "ES2022", lib: ["ES2022", "DOM", "DOM.Iterable"], module: "ESNext", moduleResolution: "Bundler", jsx: "react-jsx", strict: true, skipLibCheck: true, esModuleInterop: true, resolveJsonModule: true, allowImportingTsExtensions: true, noEmit: true, types: ["vite/client", "node"], baseUrl: ".", paths: { "@/*": ["src/*"], "@assets/*": ["assets/*"], "@shared/*": ["shared/*"] } }, include: ["src", "shared", "vite.config.ts", "scripts"] }, null, 2));
await write(".gitignore", "node_modules/\ndist/\n.env\n.env.local\n");
await write(".env.example", "# No credentials required. Enable only on an approved Vercel deployment.\nVITE_ENABLE_ANALYTICS=false\n");
await write(".replit", 'run = "npm run dev"\nmodules = ["nodejs-20"]\n[deployment]\nbuild = ["sh", "-c", "npm ci && npm run build"]\nrun = ["sh", "-c", "npm start"]\n[[ports]]\nlocalPort = 5000\nexternalPort = 80\n');
const appPaths = ["/login", "/signup", "/get-started", "/forgot-password", "/reset-password", "/hpib", "/referral-program/apply", "/referral-program/verify", "/referral-program/portal", "/referral-program/portal/login", "/referral-program/portal/auth", "/referral-program/portal/set-password", "/referral-program/portal/forgot-password"];
await write("vercel.json", JSON.stringify({
  buildCommand: "npm run build", outputDirectory: "dist", cleanUrls: true, trailingSlash: false,
  redirects: [
    { source: "/:path*", has: [{ type: "host", value: "rosterhockey.com" }], destination: "https://www.rosterhockey.com/:path*", permanent: true },
    { source: "/(baseball|soccer)(/.*)?", destination: "https://www.rosterhockey.com/hockey", permanent: true },
    ...appPaths.map(route => ({ source: route, destination: `https://www.roster-app.com${route}`, permanent: false })),
  ],
  rewrites: [{ source: "/404", destination: "/404.html" }],
  headers: ["/soccer", "/baseball", "/404"].map(source => ({ source, headers: [{ key: "X-Robots-Tag", value: "noindex, follow" }] })),
}, null, 2));
await publicAssets('"/favicon.png" "/roster-logo.png"');
await write("COPY-MANIFEST.json", JSON.stringify({ createdAt: new Date().toISOString(), mode: "copy-only; APP sources not removed", files: Array.from(copied.values()).sort((a, b) => a.destination.localeCompare(b.destination)) }, null, 2));
console.log(`Independent export: ${output}`);
console.log(`${copied.size} files, ${Array.from(copied.values()).reduce((sum, f) => sum + f.bytes, 0)} bytes; ${Object.keys(dependencies).length} runtime dependencies; no APP files removed.`);
