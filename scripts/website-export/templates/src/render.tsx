import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { WebsitePage, pages, noindexPaths } from "./pages";
import { SeoMetadataCollector, type SeoMetadata } from "./lib/seoMetadata";
import { supportFaqs } from "./pages/Support";
import { lineCombosFaqs } from "./components/marketing/line-combos/LineCombosPage";
import { benchAppFaqs } from "./components/marketing/RosterHockeyVsBenchAppPage";
import { teamSnapFaqs } from "./components/marketing/RosterHockeyVsTeamSnapPage";
import { rosterlyticFaqs } from "./components/marketing/RosterHockeyVsRosterlyticPage";
import prices from "./content/pricing.json";
export { prices };
export { pages, noindexPaths };
export function faqStructuredData(path: string) {
  const faq = path === "/line-combos-predictions" ? lineCombosFaqs : path === "/rosterhockey-vs-benchapp" ? benchAppFaqs : path === "/rosterhockey-vs-teamsnap" ? teamSnapFaqs : path === "/rosterhockey-vs-rosterlytic" ? rosterlyticFaqs : supportFaqs;
  return { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(({ question, answer }) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })) };
}
export function renderPage(pathname: string) {
  const collected = { current: null as SeoMetadata | null };
  const hook = (): [string, (next: string) => void] => [pathname, () => {}];
  const body = renderToStaticMarkup(<Router hook={hook} ssrPath={pathname}><SeoMetadataCollector value={collected}><WebsitePage pathname={pathname} /></SeoMetadataCollector></Router>);
  return { body, metadata: collected.current };
}
