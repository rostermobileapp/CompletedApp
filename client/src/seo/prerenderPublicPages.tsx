import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Router, memoryLocation } from 'wouter';
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

export const publicPagePaths = [
  '/',
  '/features',
  '/pricing',
  '/about',
  '/hockey',
  '/soccer',
  '/baseball',
  '/for-youth-teams',
  '/for-adult-leagues',
  '/for-varsity',
  '/referral-program',
  '/faq',
  '/support',
  '/privacy-policy',
  '/terms-of-service',
] as const;

function pageElement(path: string): ReactElement {
  switch (path) {
    case '/': return createElement(Landing);
    case '/features': return createElement(FeaturesPage);
    case '/pricing': return createElement(PricingPage);
    case '/about': return createElement(AboutPage);
    case '/hockey': return createElement(SportLanding, { sport: 'hockey' });
    case '/soccer': return createElement(SportLanding, { sport: 'soccer' });
    case '/baseball': return createElement(SportLanding, { sport: 'baseball' });
    case '/for-youth-teams': return createElement(SegmentLanding, { segment: 'for-youth-teams' });
    case '/for-adult-leagues': return createElement(SegmentLanding, { segment: 'for-adult-leagues' });
    case '/for-varsity': return createElement(SegmentLanding, { segment: 'for-varsity' });
    case '/referral-program': return createElement(PartnersPage);
    case '/faq':
    case '/support': return createElement(Support);
    case '/privacy-policy': return createElement(PrivacyPolicy);
    case '/terms-of-service': return createElement(TermsOfService);
    default: throw new Error(`No public page renderer registered for ${path}`);
  }
}

export function renderPublicPage(path: string, stripePrices: unknown) {
  const location = memoryLocation({ path, static: true });
  const metadata: { current: SeoMetadata | null } = { current: null };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { enabled: false, retry: false } },
  });
  queryClient.setQueryData(['/api/stripe/prices'], stripePrices);

  const content = renderToStaticMarkup(
    createElement(
      SeoMetadataCollector,
      { value: metadata },
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(Router, { hook: location.hook }, pageElement(path)),
      ),
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
