import { useSeo } from "@/hooks/useSeo";
import { RosterPageFooter, RosterPageNav } from "./RosterPageNav";
import "./line-combos/LineCombosPage.css";
import "./RosterHockeyVsBenchAppPage.css";

export const benchAppFaqs = [
  {
    question: "Is RosterHockey better than BenchApp for beer league hockey?",
    answer: "It depends. RosterHockey is hockey-only, ad-free and adds pre-game predictions. BenchApp is multi-sport, with text RSVPs and card payments.",
  },
  {
    question: "Does BenchApp have ads?",
    answer: "Yes, on the Free plan. BenchApp PRO removes them. RosterHockey has no ads on any plan, including Free.",
  },
  {
    question: "Which is cheaper?",
    answer: "Both have free plans. For a league, RosterHockey needs one Commissioner subscription ($12/mo or $119.99/yr) for the whole league; BenchApp League is $10 per team per month. For a single team, BenchApp PRO is $9/mo per team, and RosterHockey Player Pro is $6.49/mo per player who wants it.",
  },
  {
    question: "Can I collect dues by card in RosterHockey?",
    answer: "Not in the app. RosterHockey tracks dues, sends payment requests and links to Venmo or CashApp. BenchApp takes card payments through Stripe.",
  },
  {
    question: "Does BenchApp have win predictions?",
    answer: "Its public pages don't describe pre-game winning odds or score predictions. RosterHockey offers them on Player Pro and Commissioner.",
  },
  {
    question: "Does RosterHockey support other sports?",
    answer: "No, it's hockey only. BenchApp covers 16 sports.",
  },
] as const;

const comparisonRows = [
  ["Sports", "Hockey only", "16 sports, including hockey"],
  ["Free plan", "Yes, no ads", "Yes, with ads"],
  ["Paid plans", "Player Pro $6.49/mo or $64.99/yr per player; Commissioner $12/mo or $119.99/yr, one per league", "PRO $9/mo per team; League $10/team/mo"],
  ["Ads", "None on any plan", "On Free; removed with PRO"],
  ["RSVPs", "Free (in-app)", "Email (Free); text message (PRO)"],
  ["Lines", "Line combos (Player Pro, Commissioner)", "Lineup builder (Free)"],
  ["Pre-game predictions", "Winning odds, score, points, player production", "Not described on its public pages"],
  ["Card payments in app", "No; tracks dues, links to Venmo or CashApp", "Yes, via Stripe (3.9% + 0.30 per payment)"],
  ["Stats and standings", "Yes", "Yes"],
  ["Live scorekeeping", "Commissioner", "PRO and League"],
  ["League drafts", "Yes (Commissioner)", "Not described on its public pages"],
  ["Team messaging", "Yes", "Yes"],
] as const;

export function RosterHockeyVsBenchAppPage() {
  useSeo({
    title: "RosterHockey vs BenchApp: Beer League Hockey App Comparison (2026)",
    description: "RosterHockey vs BenchApp, compared for beer league hockey: pricing, ads, RSVPs, lines, payments, stats, leagues and pre-game predictions. Updated November 2026.",
    canonical: "/rosterhockey-vs-benchapp",
  });

  return (
    <main className="rp-page lc-page rhvb-page">
      <RosterPageNav active="" />

      <section className="lc-hero rhvb-hero">
        <div className="lc-container">
          <div className="lc-hero-copy">
            <h1 className="lc-title">RosterHockey vs BenchApp</h1>
            <p>RosterHockey is a hockey-only team and league app with no ads on any plan and pre-game predictions; BenchApp is a multi-sport team app with a free ad-supported plan and built-in card payments.</p>
          </div>
        </div>
      </section>

      <section className="lc-section lc-section--white">
        <div className="lc-container">
          <h2 className="lc-heading">Quick verdict</h2>
          <p className="lc-body rhvb-verdict">Pick BenchApp for multiple sports, text-message RSVPs or card payments in the app. Pick RosterHockey for hockey-only teams and leagues that want no ads, line combos with pre-game predictions, drafts, auto-advancing brackets and one Commissioner per league.</p>
        </div>
      </section>

      <section className="lc-section lc-section--blue">
        <div className="lc-container">
          <h2 className="lc-heading">Who should pick which</h2>
          <ul className="rhvb-pick-list">
            <li><strong>BenchApp:</strong> multi-sport organizers, managers who want card payments in the app, teams that need text-message RSVPs.</li>
            <li><strong>RosterHockey:</strong> beer league, adult rec, youth and varsity hockey; captains who want pre-game predictions; commissioners running drafts or tournaments.</li>
          </ul>
        </div>
      </section>

      <section className="lc-section lc-section--white">
        <div className="lc-container">
          <h2 className="lc-heading">Comparison table</h2>
          <div className="rhvb-table-wrap" role="region" aria-label="RosterHockey and BenchApp feature comparison" tabIndex={0}>
            <table className="rhvb-table">
              <caption>As of November 2026, from each company's public pages.</caption>
              <thead>
                <tr>
                  <th scope="col">Feature</th>
                  <th scope="col">RosterHockey</th>
                  <th scope="col">BenchApp</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map(([feature, rosterHockey, benchApp]) => (
                  <tr key={feature}>
                    <th scope="row">{feature}</th>
                    <td>{rosterHockey}</td>
                    <td>{benchApp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="lc-section lc-section--blue">
        <div className="lc-container">
          <h2 className="lc-heading">Pricing compared</h2>
          <div className="rhvb-copy">
            <p>RosterHockey Free is $0 forever with no ads. Player Pro is $6.49/mo or $64.99/yr per player, for players who want line combos and predictions. Commissioner is $12/mo or $119.99/yr, and only one person per league needs it to run the whole league. Prices are in USD. See <a href="/pricing">/pricing</a>.</p>
            <p>BenchApp Free is $0 with ads. PRO is $9/month per team, paid by the manager; players use it free. League is $10 per team per month with a 30-day free trial. BenchApp offers annual billing at a discount. See <a href="https://www.benchapp.com/pricing" target="_blank" rel="nofollow noopener">benchapp.com/pricing</a>.</p>
          </div>
        </div>
      </section>

      <section className="lc-section lc-section--white">
        <div className="lc-container">
          <h2 className="lc-heading">Feature differences</h2>
          <div className="rhvb-copy">
            <p>Where BenchApp is strong: it covers 16 sports and reports 60,000+ teams and 1M+ athletes. Players can RSVP by text with no app (PRO). Managers can take card payments through Stripe at no cost to the team, and lineups are free.</p>
            <p>Where RosterHockey is different: it's hockey-only, with no ads on any plan. On Player Pro and Commissioner, a captain or coach sets line combos and RosterHockey generates pre-game winning odds, score, points and player production predictions from team and player history. See <a href="/line-combos-predictions">/line-combos-predictions</a>. Commissioner adds league drafts, bracket generation and tournaments mode.</p>
            <p>Payments: RosterHockey doesn't process payments in the app. It tracks dues and ice fees, sends payment requests, links to Venmo or CashApp and keeps a register of who paid.</p>
          </div>
        </div>
      </section>

      <section className="lc-section lc-section--blue">
        <div className="lc-container">
          <h2 className="lc-heading">Switching from BenchApp</h2>
          <ol className="rhvb-switch-list">
            <li>Get RosterHockey on the <a href="https://apps.apple.com/us/app/roster-hockey/id6756852981" target="_blank" rel="noopener noreferrer">App Store</a>, <a href="https://play.google.com/store/apps/details?id=com.aFFhvtIzJvyF.natively" target="_blank" rel="noopener noreferrer">Google Play</a> or the web.</li>
            <li>Create your team and invite your roster.</li>
            <li>Add your schedule and RSVPs.</li>
            <li>Set your dues and link Venmo or CashApp.</li>
            <li>Upgrade to Player Pro or Commissioner for line combos and predictions.</li>
          </ol>
        </div>
      </section>

      <section className="lc-section lc-section--white" aria-labelledby="rhvb-faq-heading">
        <div className="lc-container">
          <h2 className="lc-heading" id="rhvb-faq-heading">FAQ</h2>
          <div className="lc-faq-list">
            {benchAppFaqs.map(({ question, answer }) => (
              <details className="lc-faq" key={question}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="lc-close">
        <div className="lc-container">
          <h2 className="lc-heading">Get started</h2>
          <p>Try RosterHockey free, with no ads and no card required.</p>
          <div className="lc-store-links">
            <a className="lc-button" href="https://www.roster-app.com/get-started">Get started</a>
            <a className="lc-button lc-button--quiet" href="https://www.roster-app.com/login">Log in</a>
          </div>
          <p className="rhvb-also-compare">Also compare: <a href="/rosterhockey-vs-teamsnap">RosterHockey vs TeamSnap</a>.</p>
        </div>
      </section>

      <RosterPageFooter />
    </main>
  );
}

export default RosterHockeyVsBenchAppPage;
