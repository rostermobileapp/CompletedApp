import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Router } from 'wouter';
import Landing from '@/components/marketing/ScrollStory';
import { FeaturesPage } from '@/components/marketing/FeaturesPage';
import { PricingPage } from '@/components/marketing/PricingPage';
import { AboutPage } from '@/components/marketing/AboutPage';
import { PartnersPage } from '@/components/marketing/PartnersPage';
import SportLanding from '@/pages/SportLanding';
import SegmentLanding from '@/pages/SegmentLanding';
import Support, { supportFaqs } from '@/pages/Support';
import PrivacyPolicy from '@/pages/PrivacyPolicy';
import TermsOfService from '@/pages/TermsOfService';
import { SeoMetadataCollector, type SeoMetadata } from '@/lib/seoMetadata';

// Register future public blog/guide pages here too: both their initial HTML
// and sitemap entries are generated from this single registry at build time.
const publicPages: Record<string, () => ReactElement> = {
  '/': () => createElement(Landing),
  '/features': () => createElement(FeaturesPage),
  '/pricing': () => createElement(PricingPage),
  '/about': () => createElement(AboutPage),
  '/hockey': () => createElement(SportLanding, { sport: 'hockey' }),
  '/soccer': () => createElement(SportLanding, { sport: 'soccer' }),
  '/baseball': () => createElement(SportLanding, { sport: 'baseball' }),
  '/for-youth-teams': () => createElement(SegmentLanding, { segment: 'for-youth-teams' }),
  '/for-adult-leagues': () => createElement(SegmentLanding, { segment: 'for-adult-leagues' }),
  '/for-varsity': () => createElement(SegmentLanding, { segment: 'for-varsity' }),
  '/referral-program': () => createElement(PartnersPage),
  '/faq': () => createElement(Support),
  '/support': () => createElement(Support),
  '/privacy-policy': () => createElement(PrivacyPolicy),
  '/terms-of-service': () => createElement(TermsOfService),
};
export const publicPagePaths = Object.keys(publicPages);

function pageElement(path: string): ReactElement {
  const render = Object.hasOwn(publicPages, path) ? publicPages[path] : undefined;
  if (!render) throw new Error(`No public page renderer registered for ${path}`);
  return render();
}

export function renderPublicPage(path: string, stripePrices: unknown) {
  const locationHook = () => [path, () => undefined] as [string, (to: string) => void];
  locationHook.searchHook = () => '';
  const metadata: { current: SeoMetadata | null } = { current: null };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { enabled: false, retry: false } },
  });
  queryClient.setQueryData(['/api/stripe/prices'], stripePrices);

  const content = renderToStaticMarkup(
    createElement(
      SeoMetadataCollector,
      {
        value: metadata,
        children: createElement(
          QueryClientProvider,
          {
            client: queryClient,
            children: createElement(Router, {
              hook: locationHook,
              children: pageElement(path),
            }),
          },
        ),
      },
    ),
  );

  if (!metadata.current?.title || !metadata.current.description) {
    throw new Error(`Public page ${path} did not register title and description metadata.`);
  }
  const h1Count = (content.match(/<h1(?:\s|>)/g) || []).length;
  if (h1Count !== 1) throw new Error(`Public page ${path} must render exactly one H1; got ${h1Count}.`);
  return { content, metadata: metadata.current };
}

export function faqStructuredData() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: supportFaqs.map(({ question, answer }) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: { '@type': 'Answer', text: answer },
    })),
  };
}
