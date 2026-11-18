import { createServer } from "vite";
import fs from "node:fs/promises";
import path from "node:path";
import { createServer as createHttpServer } from "node:http";
import { structuredData } from "./structuredData";
const origin = "https://www.rosterhockey.com";
const html = await fs.readFile("dist/index.html", "utf8");
// Attach Vite's unused build-time websocket to a non-listening server so SSR
// cannot reserve the running app's HMR port.
const vite = await createServer({ server: { middlewareMode: true, hmr: { server: createHttpServer() }, watch: null }, optimizeDeps: { noDiscovery: true, include: [] }, appType: "custom" });
const escape = (s: string) => s.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
try {
  const { renderPage, pages, noindexPaths, prices, faqStructuredData } = await vite.ssrLoadModule("/src/render.tsx");
  for (const route of [...Object.keys(pages), "/404"]) {
    const { body, metadata } = renderPage(route);
    const meta = metadata || { title: "Page not found | RosterHockey", description: "This page does not exist.", canonical: `${origin}${route}` };
    const robots = noindexPaths.has(route) ? "noindex, follow" : "index, follow";
    const tags = `<meta name="description" content="${escape(meta.description)}"><meta name="robots" content="${robots}"><link rel="canonical" href="${escape(meta.canonical)}"><meta property="og:site_name" content="RosterHockey"><meta property="og:type" content="website"><meta property="og:title" content="${escape(meta.ogTitle || meta.title)}"><meta property="og:description" content="${escape(meta.ogDescription || meta.description)}"><meta property="og:url" content="${escape(meta.canonical)}"><meta property="og:image" content="${escape(meta.ogImage || `${origin}/roster-logo.png`)}"><meta name="twitter:card" content="summary_large_image">`;
    const links = body.replace(/<a\b[^>]*>/g, (tag: string) => {
      if (!/href="https:\/\/www\.roster-app\.com(?:\/|")/.test(tag)) return tag;
      return tag.replace(/\s(?:target|rel)="[^"]*"/g, "").replace(/>$/, ' target="_blank" rel="noopener noreferrer">');
    });
    let output = html.replace(/<title>.*?<\/title>/, `<title>${escape(meta.title)}</title>`).replace("</head>", `${tags}</head>`).replace('<div id="root"></div>', `<div id="root">${links}</div>`);
    const structured = route === "/404" ? { "@context": "https://schema.org", "@type": "WebPage", name: meta.title, url: meta.canonical } : structuredData(route, prices, faqStructuredData(route === "/contact" ? "/support" : route));
    output = output.replace("</head>", `<script type="application/ld+json">${JSON.stringify(structured).replaceAll("<", "\\u003c")}</script></head>`);
    const file = route === "/" ? "dist/index.html" : route === "/404" ? "dist/404.html" : path.join("dist", route, "index.html");
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, output);
  }
  const indexed = Object.keys(pages).filter(route => !noindexPaths.has(route));
  await fs.writeFile("dist/sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${indexed.map(route => `<url><loc>${origin}${route}</loc></url>`).join("")}</urlset>`);
  await fs.writeFile("dist/robots.txt", `User-agent: *\nAllow: /\nDisallow: /soccer\nDisallow: /baseball\nSitemap: ${origin}/sitemap.xml\n`);
  await fs.writeFile("dist/llms.txt", `# RosterHockey\n\nHockey team and league management. Hockey is available on iOS and Android. Soccer/baseball are not launched.\n\n${indexed.map(route => `- ${origin}${route}`).join("\n")}\n\nSignup, accounts, partner applications and billing are owned by https://www.roster-app.com.\n`);
  console.log(`Prerendered ${Object.keys(pages).length} public routes plus the real 404 page, without APP/API access.`);
} finally { await vite.close(); }
