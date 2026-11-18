import { createElement, type ReactElement } from "react";
import Landing from "./components/marketing/ScrollStory";
import { FeaturesPage } from "./components/marketing/FeaturesPage";
import { PricingPage } from "./components/marketing/PricingPage";
import { AboutPage } from "./components/marketing/AboutPage";
import { PartnersPage } from "./components/marketing/PartnersPage";
import LineCombos from "./components/marketing/line-combos/LineCombosPage";
import VsBenchApp from "./components/marketing/RosterHockeyVsBenchAppPage";
import VsTeamSnap from "./components/marketing/RosterHockeyVsTeamSnapPage";
import VsRosterlytic from "./components/marketing/RosterHockeyVsRosterlyticPage";
import Sport from "./pages/SportLanding";
import Segment from "./pages/SegmentLanding";
import Support from "./pages/Support";
import Privacy from "./pages/Privacy";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Terms from "./pages/TermsOfService";

export const pages: Record<string, () => ReactElement> = {
  "/": () => createElement(Landing),
  "/features": () => createElement(FeaturesPage),
  "/pricing": () => createElement(PricingPage),
  "/about": () => createElement(AboutPage),
  "/referral-program": () => createElement(PartnersPage),
  "/line-combos-predictions": () => createElement(LineCombos),
  "/rosterhockey-vs-benchapp": () => createElement(VsBenchApp),
  "/rosterhockey-vs-teamsnap": () => createElement(VsTeamSnap),
  "/rosterhockey-vs-rosterlytic": () => createElement(VsRosterlytic),
  "/hockey": () => createElement(Sport, { sport: "hockey" }),
  "/for-youth-teams": () => createElement(Segment, { segment: "for-youth-teams" }),
  "/for-adult-leagues": () => createElement(Segment, { segment: "for-adult-leagues" }),
  "/for-varsity": () => createElement(Segment, { segment: "for-varsity" }),
  "/faq": () => createElement(Support),
  "/support": () => createElement(Support),
  "/contact": () => createElement(Support),
  "/privacy": () => createElement(Privacy, { publicPage: true }),
  "/privacy-policy": () => createElement(PrivacyPolicy),
  "/terms": () => createElement(Terms),
  "/terms-of-service": () => createElement(Terms),
};
export const noindexPaths = new Set(["/soccer", "/baseball", "/404"]);
export function WebsitePage({ pathname }: { pathname: string }) {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  const render = Object.hasOwn(pages, normalized) ? pages[normalized] : undefined;
  return render ? render() : <main style={{ padding: 40 }}><h1>Page not found</h1><p>This page does not exist.</p><a href="/">Return to RosterHockey</a></main>;
}
