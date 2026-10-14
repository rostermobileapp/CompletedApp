import { createServer } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';

const SITE_ORIGIN = 'https://www.roster-app.com';
const API_ORIGIN = (process.env.PRERENDER_API_ORIGIN || process.env.VITE_API_BASE_URL ||
  'https://completedapp-production.up.railway.app').replace(/\/+$/, '').replace(/\/api$/, '');
const outputDir = path.resolve('dist/public');
const indexPath = path.join(outputDir, 'index.html');
const templatePath = path.join(outputDir, '.prerender-index.html');

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function putMeta(html: string, selector: RegExp, tag: string) {
  return selector.test(html) ? html.replace(selector, tag) : html.replace('</head>', `    ${tag}\n  </head>`);
}

function jsonLdScript(value: unknown) {
  const json = JSON.stringify(value).replace(/</g, '\\u003c');
  JSON.parse(json);
  return `<script type="application/ld+json">${json}</script>`;
}

async function fetchRealPrices() {
  const response = await fetch(`${API_ORIGIN}/api/stripe/prices`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Stripe price endpoint returned HTTP ${response.status}.`);
  const prices = await response.json() as Record<string, { amount?: number | null; currency?: string | null }>;
  const available = Object.values(prices).filter(price => Number.isFinite(price.amount) && price.currency);
  if (available.length === 0) throw new Error('Stripe price endpoint returned no verified prices for application structured data.');
  return prices;
}

function structuredData(
  pathname: string,
  prices: Record<string, { amount?: number | null; currency?: string | null }>,
  faqPage: Record<string, unknown>,
) {
  const storeLinks = [
    'https://apps.apple.com/us/app/roster-hockey/id6756852981',
    'https://play.google.com/store/apps/details?id=com.aFFhvtIzJvyF.natively&utm_source=na_Med',
  ];
  const offers = Object.entries(prices)
    .filter(([, price]) => Number.isFinite(price.amount) && price.currency)
    .map(([key, price]) => ({
      '@type': 'Offer',
      name: ({
        player_pro_monthly: 'Player Pro monthly',
        player_pro_yearly: 'Player Pro yearly',
        commissioner_monthly: 'Commissioner monthly',
        commissioner_yearly: 'Commissioner yearly',
      } as Record<string, string>)[key] || key.replaceAll('_', ' '),
      price: price.amount,
      priceCurrency: price.currency!.toUpperCase(),
      availability: 'https://schema.org/InStock',
      url: `${SITE_ORIGIN}/pricing`,
    }));
  const entities: Record<string, unknown>[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Roster',
      url: SITE_ORIGIN,
      logo: `${SITE_ORIGIN}/roster-logo.png`,
      sameAs: storeLinks,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Roster',
      applicationCategory: 'SportsApplication',
      operatingSystem: 'iOS, Android',
      description: 'A hockey-specific team and league management app for schedules, attendance, team communication, payments, substitutes, and league operations.',
      url: SITE_ORIGIN,
      offers,
    },
  ];
  if (pathname === '/faq' || pathname === '/support') {
    entities.push(faqPage);
  }
  return entities;
}

async function writeSitemap(pagePaths: readonly string[], lastmod: string) {
  const urls = pagePaths.map(pagePath =>
    `  <url><loc>${SITE_ORIGIN}${pagePath === '/' ? '/' : pagePath}</loc><lastmod>${lastmod}</lastmod></url>`,
  ).join('\n');
  await fs.writeFile(path.join(outputDir, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
}

async function main() {
  const prices = await fetchRealPrices();
  let baseHtml: string;
  try {
    baseHtml = await fs.readFile(templatePath, 'utf8');
  } catch {
    baseHtml = await fs.readFile(indexPath, 'utf8');
    await fs.writeFile(templatePath, baseHtml);
  }
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const vite = await createServer({
    configFile: false,
    mode: 'production',
    root: path.resolve('client'),
    resolve: {
      alias: [
        { find: /^@\/lib\/supabase$/, replacement: path.resolve('client/src/seo/ssrSupabaseStub.ts') },
        { find: '@shared', replacement: path.resolve('shared') },
        { find: '@assets', replacement: path.resolve('attached_assets') },
        { find: '@', replacement: path.resolve('client/src') },
      ],
    },
    esbuild: { jsx: 'automatic' },
    server: { middlewareMode: true },
    appType: 'custom',
    logLevel: 'error',
  });
  try {
    const renderer = await vite.ssrLoadModule('/src/seo/prerenderPublicPages.tsx') as {
      publicPagePaths: readonly string[];
      renderPublicPage: (pathname: string, prices: unknown) => {
        content: string;
        metadata: { title: string; description: string; ogTitle?: string; ogDescription?: string; canonical?: string };
      };
      faqStructuredData: () => Record<string, unknown>;
    };
    const titles = new Set<string>();
    const seoErrors: string[] = [];
    let rootHtml: string | undefined;
    for (const pathname of renderer.publicPagePaths) {
      const { content, metadata } = renderer.renderPublicPage(pathname, prices);
      const canonical = `${SITE_ORIGIN}${pathname === '/' ? '/' : pathname}`;
      const title = metadata.title.trim();
      const description = metadata.description.trim();
      if (title.length >= 60) seoErrors.push(`${pathname} title must be under 60 characters (${title.length}): ${title}`);
      if (description.length >= 160) seoErrors.push(`${pathname} description must be under 160 characters (${description.length}).`);
      if (titles.has(title)) seoErrors.push(`Duplicate SEO title "${title}" on ${pathname}.`);
      titles.add(title);

      let html = baseHtml.replace('<div id="root"></div>', `<div id="root" data-prerendered="true">${content}</div>`);
      if (html === baseHtml) throw new Error('Could not find the React root in built index.html.');
      html = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
      html = putMeta(html, /<meta\s+name="description"[^>]*>/i,
        `<meta name="description" content="${escapeHtml(description)}" />`);
      html = putMeta(html, /<meta\s+property="og:title"[^>]*>/i,
        `<meta property="og:title" content="${escapeHtml(metadata.ogTitle || title)}" />`);
      html = putMeta(html, /<meta\s+property="og:description"[^>]*>/i,
        `<meta property="og:description" content="${escapeHtml(metadata.ogDescription || description)}" />`);
      html = putMeta(html, /<meta\s+property="og:url"[^>]*>/i, `<meta property="og:url" content="${canonical}" />`);
      html = putMeta(html, /<link\s+rel="canonical"[^>]*>/i, `<link rel="canonical" href="${canonical}" />`);
      html = putMeta(html, /<meta\s+name="twitter:title"[^>]*>/i,
        `<meta name="twitter:title" content="${escapeHtml(metadata.ogTitle || title)}" />`);
      html = putMeta(html, /<meta\s+name="twitter:description"[^>]*>/i,
        `<meta name="twitter:description" content="${escapeHtml(metadata.ogDescription || description)}" />`);
      if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') {
        html = putMeta(html, /<meta\s+name="robots"[^>]*>/i, '<meta name="robots" content="noindex,nofollow" />');
      }
      html = html.replace('</head>',
        `    ${jsonLdScript(structuredData(pathname, prices, renderer.faqStructuredData()))}\n  </head>`);
      const relativePath = pathname === '/' ? 'index.html' : path.join(pathname.slice(1), 'index.html');
      const destination = path.join(outputDir, relativePath);
      if (pathname === '/') {
        rootHtml = html;
      } else {
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.writeFile(destination, html);
      }
      console.log(`Prerendered ${pathname}`);
    }
    await fs.writeFile(path.join(outputDir, '404.html'),
      '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><title>Page not found | Roster</title><link rel="canonical" href="https://www.roster-app.com/"></head><body><main><h1>Page not found</h1><p>The page you requested does not exist.</p><a href="/">Return to Roster</a></main></body></html>');
    await writeSitemap(renderer.publicPagePaths, new Date().toISOString().slice(0, 10));
    if (seoErrors.length) throw new Error(`SEO validation failed:\n${seoErrors.map(error => `- ${error}`).join('\n')}`);
    if (!rootHtml) throw new Error('The homepage was not prerendered.');
    await fs.writeFile(indexPath, rootHtml);
    await fs.rm(templatePath, { force: true });
  } finally {
    await vite.close();
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
}

await main();
