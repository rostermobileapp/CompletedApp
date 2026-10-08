import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSeo } from "@/hooks/useSeo";
import { ArrowRight, Check, Shield, Sparkles, X } from "lucide-react";
import { RosterPageFooter, RosterPageNav } from "./RosterPageNav";
import "./PricingPage.css";

const freeFeatures = ["Daily Hockey Trivia", "Beer Counter (Adult Players)", "Earn Patch Progress", "Team Schedule", "In-App Only RSVP", "In App Messaging (Team Chat)", "Facility Event Calendar", "Website Portal", "Team Stats", "Standings"];
const proFeatures = ["Trophy Case & Patch Artwork (21+)", "Create Team Events/Games", "Roster Management", "Player/Attendance Tracking", "Intelligent Sub Request Tool", "Polls/Bulletins", "Fee & Payment Tracking", "Links to Venmo/CashApp", "Team Expense Tracking", "Multi-Team/Org Management", "Registration Notices", "Volunteer/Role Assignment", "League Stats"];
const commissionerFeatures = ["A-Z League Management", "Bracket Generation Tool", "In-Game Scorekeeping", "League Drafts", "3 Stars of the Game", "Custom Awards", "Tournaments Mode"];
const comparison = [
  ["No ads", "never", "never", "never"],
  ["Team Schedule", "yes", "yes", "yes"],
  ["In-App Only RSVP", "yes", "yes", "yes"],
  ["In-App Messaging", "Team chat only", "yes", "yes"],
  ["Facility Event Calendar", "yes", "yes", "yes"],
  ["Website Portal", "yes", "yes", "yes"],
  ["Team Stats and Standings", "yes", "yes", "yes"],
  ["Daily Hockey Trivia", "yes", "yes", "yes"],
  ["Personal Beer Counter", "yes", "yes", "yes"],
  ["Earn Patch Progress", "yes", "yes", "yes"],
  ["Trophy Case & Patch Artwork (21+)", "no", "yes", "yes"],
  ...proFeatures.slice(1).map(label => [label, "no", "yes", "yes"]),
  ...commissionerFeatures.map(label => [label, "no", "no", "yes"]),
];

type StripePriceEntry = { id: string; amount: number | null; currency: string | null };
type StripePrices = Partial<Record<"player_pro_monthly" | "player_pro_yearly" | "commissioner_monthly" | "commissioner_yearly", StripePriceEntry>>;

function PlanCard({ name, audience, price, note, features, featured, annual = false }: { name: string; audience: string; price: string; note: string; features: string[]; featured?: boolean; annual?: boolean }) {
  return (
    <article className={`pp-plan${featured ? " is-featured" : ""}`}>
      {featured && <span className="pp-most-popular"><Sparkles size={13} /> MOST POPULAR</span>}
      <div className="pp-plan-type">{name}</div>
      <p className="pp-plan-audience">{audience}</p>
      <div className="pp-price">{price}<small>{name === "Free" ? "forever" : annual ? "per month · billed annually" : "per month"}</small></div>
      <p className="pp-price-note">{note}</p>
      <a className="pp-plan-action" href="/get-started">Get started <ArrowRight size={15} /></a>
      <div className="pp-includes-label">INCLUDES</div>
      <ul>{features.map(feature => <li key={feature}><Check size={15} />{feature}</li>)}</ul>
    </article>
  );
}

export function PricingPage() {
  const [annual, setAnnual] = useState(false);
  useSeo({ title: "Pricing | Roster — Free, Pro & Commissioner Plans", description: "Start free. Compare Player Pro and Commissioner plans for hockey teams and leagues. No ads on any plan." });
  const { data: prices, isLoading, isError, refetch } = useQuery<StripePrices>({ queryKey: ["/api/stripe/prices"] });
  const formatPrice = (entry?: StripePriceEntry, monthlyEquivalent = false) => {
    if (isLoading) return "Loading…";
    if (!entry || entry.amount === null || !entry.currency) return "Unavailable";
    return new Intl.NumberFormat("en-US", { style: "currency", currency: entry.currency.toUpperCase(), minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(entry.amount / (monthlyEquivalent ? 12 : 1));
  };
  const planPrice = (plan: "player_pro" | "commissioner") => formatPrice(prices?.[`${plan}_${annual ? "yearly" : "monthly"}`], annual);
  const planNote = (plan: "player_pro" | "commissioner") => {
    const entry = prices?.[`${plan}_${annual ? "yearly" : "monthly"}`];
    if (isLoading) return "Loading current pricing.";
    if (isError || entry?.amount == null) return "Pricing is temporarily unavailable. Please try again.";
    return annual ? `${formatPrice(entry)} billed annually.` : "Billed monthly. No ads, ever.";
  };
  return (
    <main className="rp-page pp-page">
      <RosterPageNav active="pricing" />
      <section className="pp-hero">
        <div className="pp-container">
          <span className="rp-kicker">Clear access. No surprises.</span>
          <h1 className="rp-title">Simple pricing.<br /><em>No surprises.</em></h1>
          <p>Free to start. No credit card required. No ads on any plan — ever.</p>
          <div className="pp-trust"><span><Shield size={17} /> No ads. Ever.</span><span><Check size={17} /> Free to start</span><span><Check size={17} /> No card required</span></div>
        </div>
      </section>

      <section className="pp-plans-section" aria-label="Roster subscription plans">
        <div className="pp-container">
          <div className="pp-billing-control">
            <span className={!annual ? "is-current" : ""}>Monthly</span>
            <button aria-label="Toggle annual billing" aria-pressed={annual} onClick={() => setAnnual(value => !value)}><i className={annual ? "is-on" : ""} /></button>
            <span className={annual ? "is-current" : ""}>Annual</span>
          </div>
          {annual && <p className="pp-billing-note">Monthly equivalent shown · billed annually.</p>}
          {(isError || (!isLoading && (!prices?.player_pro_monthly?.amount || !prices?.commissioner_monthly?.amount))) && <p className="pp-billing-note" role="alert">Some prices are temporarily unavailable. <button onClick={() => refetch()}>Retry pricing</button></p>}
          <div className="pp-plan-grid">
            <PlanCard name="Free" audience="Perfect for players joining their first team." price="$0" note="Free to start. No ads, ever." features={freeFeatures} />
            <PlanCard name="Player Pro" audience="For serious players who want the full experience." price={planPrice("player_pro")} note={planNote("player_pro")} annual={annual} features={["Everything in Free", ...proFeatures]} featured />
            <PlanCard name="Commissioner" audience="Run a full league with schedules, scores, standings, and tournaments." price={planPrice("commissioner")} note={planNote("commissioner")} annual={annual} features={["Everything in Player Pro", ...commissionerFeatures]} />
          </div>
          <p className="pp-rate-footnote">Current pricing is loaded from our pricing service. Final availability and pricing are confirmed before purchase and may vary by platform.</p>
        </div>
      </section>

      <section className="pp-fun">
        <div className="pp-container pp-fun-panel">
          <span className="rp-kicker">The fun starts on Free</span>
          <h2 className="rp-title rp-title-sm">A little more<br />after the final buzzer.</h2>
          <p>Play daily hockey trivia, track your post-game beers, and build patch progress. Upgrade to Player Pro or Commissioner to explore your Trophy Case and reveal patch artwork. Trophy Case access requires a verified age of 21 or older.</p>
          <div className="pp-fun-badges"><span><Check size={15} /> Trivia is free</span><span><Check size={15} /> Personal beer counter is free</span><span><Shield size={15} /> Full artwork is paid, 21+</span></div>
        </div>
      </section>

      <section className="pp-comparison">
        <div className="pp-container">
          <span className="rp-kicker">Plan details</span>
          <h2 className="rp-title rp-title-sm">Every feature.<br />Side by side.</h2>
          <div className="pp-table-wrap">
            <table><thead><tr><th>Feature</th><th>Free</th><th>Player Pro</th><th>Commissioner</th></tr></thead>
              <tbody>{comparison.map(([feature, free, pro, commissioner]) => <tr key={feature}>
                <th scope="row">{feature}</th>{[free, pro, commissioner].map((value, index) => <td key={index}>{value === "yes" ? <Check className="pp-check" size={17} aria-label="Included" /> : value === "never" ? <strong className="pp-never">NEVER</strong> : value === "no" ? <X className="pp-unavailable" size={15} aria-label="Not included" /> : <span>{value}</span>}</td>)}
              </tr>)}</tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="pp-bottom-cta"><div><span className="rp-kicker">Built for your next season</span><h2 className="rp-title rp-title-sm">Start free.<br />Find your next level.</h2><a href="/features" className="rp-primary-link">See all features <ArrowRight size={16} /></a></div></section>
      <RosterPageFooter />
    </main>
  );
}
