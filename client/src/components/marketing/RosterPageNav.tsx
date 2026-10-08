import { useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import "./RosterPageNav.css";

const pages = [
  { key: "features", label: "Features", href: "/features" },
  { key: "pricing", label: "Pricing", href: "/pricing" },
  { key: "about", label: "About", href: "/about" },
  { key: "partners", label: "Partners", href: "/referral-program" },
];

export function RosterPageNav({ active }: { active: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="rp-nav">
      <a className="rp-nav-logo" href="/" aria-label="Roster homepage">
        <img src="/marketing/roster-home/logo-dark.png" alt="Roster" />
      </a>
      <nav className="rp-nav-links" aria-label="Main navigation">
        {pages.map(page => <a key={page.key} href={page.href} aria-current={active === page.key ? "page" : undefined} className={active === page.key ? "is-active" : ""}>{page.label}</a>)}
        <a href="/login">Log in</a>
      </nav>
      <a className="rp-nav-cta" href="/">Home <ArrowRight size={15} /></a>
      <button className="rp-nav-toggle" aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} onClick={() => setMenuOpen(value => !value)}>
        {menuOpen ? <X size={20} /> : <Menu size={20} />}
      </button>
      {menuOpen && <nav className="rp-mobile-menu" aria-label="Mobile navigation">
        <a href="/" onClick={() => setMenuOpen(false)}>Home</a>
        {pages.map(page => <a key={page.key} href={page.href} aria-current={active === page.key ? "page" : undefined} onClick={() => setMenuOpen(false)}>{page.label}</a>)}
        <a href="/login">Log in</a>
        <a href="/get-started">Get started</a>
      </nav>}
    </header>
  );
}

export function RosterPageFooter() {
  return (
    <footer className="rp-footer">
      <a href="/" aria-label="Back to Roster homepage"><img src="/marketing/roster-home/logo-dark.png" alt="Roster" /></a>
      <span>Built for hockey. Made for the people around it.</span>
      <nav aria-label="Footer navigation">
        {pages.map(page => <a key={page.key} href={page.href}>{page.label}</a>)}
        <a href="/terms-of-service">Terms</a>
        <a href="/privacy-policy">Privacy</a>
        <a href="/support">Support</a>
      </nav>
    </footer>
  );
}
