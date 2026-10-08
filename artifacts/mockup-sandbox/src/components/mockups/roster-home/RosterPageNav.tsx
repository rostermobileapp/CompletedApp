import { useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import "./RosterPageNav.css";

const pages = [
  { key: "features", label: "Features", href: "/__mockup/preview/roster-home/FeaturesPage" },
  { key: "pricing", label: "Pricing", href: "/__mockup/preview/roster-home/PricingPage" },
  { key: "about", label: "About", href: "/__mockup/preview/roster-home/AboutPage" },
  { key: "partners", label: "Partners", href: "/__mockup/preview/roster-home/PartnersPage" },
];

export function RosterPageNav({ active }: { active: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="rp-nav">
      <a className="rp-nav-logo" href="/__mockup/preview/roster-home/ScrollStory" aria-label="Roster homepage">
        <img src="/__mockup/images/roster-home/logo-dark.png" alt="Roster" />
      </a>
      <nav className="rp-nav-links" aria-label="Main navigation">
        {pages.map(page => <a key={page.key} href={page.href} aria-current={active === page.key ? "page" : undefined} className={active === page.key ? "is-active" : ""}>{page.label}</a>)}
      </nav>
      <a className="rp-nav-cta" href="/__mockup/preview/roster-home/ScrollStory">Home <ArrowRight size={15} /></a>
      <button className="rp-nav-toggle" aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}>
        {menuOpen ? <X size={20} /> : <Menu size={20} />}
      </button>
      {menuOpen && <nav className="rp-mobile-menu" aria-label="Mobile navigation">
        <a href="/__mockup/preview/roster-home/ScrollStory" onClick={() => setMenuOpen(false)}>Home</a>
        {pages.map(page => <a key={page.key} href={page.href} aria-current={active === page.key ? "page" : undefined} onClick={() => setMenuOpen(false)}>{page.label}</a>)}
      </nav>}
    </header>
  );
}

export function RosterPageFooter() {
  return (
    <footer className="rp-footer">
      <a href="/__mockup/preview/roster-home/ScrollStory" aria-label="Back to Roster homepage"><img src="/__mockup/images/roster-home/logo-dark.png" alt="Roster" /></a>
      <span>Built for hockey. Made for the people around it.</span>
      <nav aria-label="Footer navigation">
        {pages.map(page => <a key={page.key} href={page.href}>{page.label}</a>)}
      </nav>
    </footer>
  );
}
