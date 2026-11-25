import { Link } from "wouter";
import "@/components/high-school-onboarding/onboarding.css";
import "./family-setup.css";

/** A signed-in Home when parent authority is locked or cannot be checked.
 * Do not mount private adult/family queries just to leave verification. */
export function ParentAccountHome() {
  return <main className="hsy family-setup" aria-label="Home">
    <div className="hsy-frame">
      <header className="family-topline">
        <div><span className="family-brand">RosterHockey</span>
          <span className="family-brand-subtitle">Home</span></div>
      </header>
      <section className="hsy-content">
        <h1>Home</h1>
        <p className="hsy-subtitle">You're still signed in. Your saved family setup has not changed.</p>
        <div className="hsy-card">
          <h2>Family</h2>
          <p>Manage your children and their devices. Verify parent access when you're ready to open parent controls.</p>
          <Link href="/high-school/family" className="hsy-primary">Open Family</Link>
        </div>
      </section>
    </div>
  </main>;
}
