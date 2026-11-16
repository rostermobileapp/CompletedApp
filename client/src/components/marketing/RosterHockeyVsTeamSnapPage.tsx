import { useSeo } from "@/hooks/useSeo";
import { RosterPageFooter, RosterPageNav } from "./RosterPageNav";
import "./line-combos/LineCombosPage.css";
import "./RosterHockeyVsTeamSnapPage.css";

export const teamSnapFaqs = [
  {
    question: "Is RosterHockey better than TeamSnap for hockey?",
    answer: "It depends. RosterHockey is hockey-only, ad-free and adds pre-game predictions. TeamSnap covers 100+ sports, with card invoicing and club tools.",
  },
  {
    question: "Which is cheaper for a league?",
    answer: "RosterHockey needs one Commissioner per league at $12/mo or $119.99/yr. TeamSnap ONE league pricing is by custom quote, so it isn't public.",
  },
  {
    question: "Is RSVP tracking free?",
    answer: "On RosterHockey, yes. On TeamSnap, availability and RSVP tracking need Premium or Ultra.",
  },
  {
    question: "Can I collect dues by card in RosterHockey?",
    answer: "Not in the app. RosterHockey tracks dues and links to Venmo or CashApp. TeamSnap takes cards through invoicing.",
  },
  {
    question: "Does TeamSnap have win predictions?",
    answer: "Its public pages don't describe pre-game winning odds or score predictions. RosterHockey has them on Player Pro and Commissioner.",
  },
  {
    question: "Does RosterHockey support other sports?",
    answer: "No, it's hockey only. TeamSnap supports 100+ sports.",
  },
] as const;

const comparisonRows = [
  ["Sports", "Hockey only", "100+ sports, including ice hockey"],
  ["Free plan", "Yes, no ads", "Yes (roster up to 15)"],
  ["Team plans", "Player Pro $6.49/mo or $64.99/yr per player", "Premium $10.83/mo (annual) or $18.99/mo; Ultra $13.75/mo (annual) or $25.99/mo, per team"],
  ["League plans", "Commissioner $12/mo or $119.99/yr; one per league", "TeamSnap ONE, custom quote"],
  ["Ads", "None on any plan", "On Free; Premium is ad-free for admins"],
  ["RSVPs", "Free (in-app)", "Premium and Ultra"],
  ["Lines", "Line combos (Player Pro, Commissioner)", "Lineup builder with ice hockey positions"],
  ["Pre-game predictions", "Winning odds, score, points, player production", "Not described on its public pages"],
  ["Card payments in app", "No; tracks dues, links to Venmo or CashApp", "Yes, invoicing (3.25% + $1.50, passed to payer)"],
  ["Stats", "Yes", "Premium and Ultra, entered on the web"],
  ["Standings and brackets", "Standings (Free); brackets (Commissioner)", "TeamSnap ONE tournaments"],
  ["League drafts", "Yes (Commissioner)", "Not described on its public pages"],
] as const;

export function RosterHockeyVsTeamSnapPage() {
  useSeo({
    title: "RosterHockey vs TeamSnap: Hockey Team & League App Comparison (2026)",
    description: "RosterHockey vs TeamSnap, compared for beer league and rec hockey: pricing, ads, RSVPs, lines, payments, stats, league tools and pre-game predictions. Updated November 2026.",
    canonical: "/rosterhockey-vs-teamsnap",
  });

  return (
    <main className="rp-page lc-page rhvs-page">
      <RosterPageNav active="" />

      <section className="lc-hero rhvs-hero">
        <div className="lc-container">
          <div className="lc-hero-copy">
            <h1 className="lc-title">RosterHockey vs TeamSnap</h1>
            <p>RosterHockey is a hockey-only team and league app with no ads on any plan and pre-game predictions; TeamSnap is a multi-sport, youth-focused team and club platform with in-app card payments.</p>
          </div>
        </div>
      </section>

      <section className="lc-section lc-section--white">
        <div className="lc-container">
          <h2 className="lc-heading">Quick verdict</h2>
          <p className="lc-body rhvs-verdict">Pick TeamSnap for multiple sports, large youth clubs or card invoicing. Pick RosterHockey for hockey-only teams and leagues that want no ads, free RSVPs, pre-game predictions and one Commissioner per league.</p>
        </div>
      </section>

      <section className="lc-section lc-section--blue">
        <div className="lc-container">
          <h2 className="lc-heading">Who should pick which</h2>
          <ul className="rhvs-pick-list">
            <li><strong>TeamSnap:</strong> multi-sport families and youth clubs that need registration, live streaming and sponsorships.</li>
            <li><strong>RosterHockey:</strong> beer league, adult rec, youth and varsity hockey; captains who want predictions; commissioners running drafts or tournaments.</li>
          </ul>
        </div>
      </section>

      <section className="lc-section lc-section--white">
        <div className="lc-container">
          <h2 className="lc-heading">Comparison table</h2>
          <div className="rhvs-table-wrap" role="region" aria-label="RosterHockey and TeamSnap feature comparison" tabIndex={0}>
            <table className="rhvs-table">
              <caption>As of November 2026, from each company's public pages.</caption>
              <thead>
                <tr>
                  <th scope="col">Feature</th>
                  <th scope="col">RosterHockey</th>
                  <th scope="col">TeamSnap</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map(([feature, rosterHockey, teamSnap]) => (
                  <tr key={feature}>
                    <th scope="row">{feature}</th>
                    <td>{rosterHockey}</td>
                    <td>{teamSnap}</td>
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
          <div className="rhvs-copy">
            <p>RosterHockey Free is $0 forever with no ads. Player Pro is $6.49/mo or $64.99/yr per player. Commissioner is $12/mo or $119.99/yr, and one Commissioner runs the whole league. USD. See <a href="/pricing">/pricing</a>.</p>
            <p>TeamSnap Classic, for standalone teams: Free for up to 15 players; Premium (up to 40) $10.83/mo billed annually or $18.99 monthly; Ultra (unlimited) $13.75/mo billed annually or $25.99 monthly. Clubs and leagues use TeamSnap ONE (custom quote).</p>
          </div>
        </div>
      </section>

      <section className="lc-section lc-section--white">
        <div className="lc-container">
          <h2 className="lc-heading">Feature differences</h2>
          <div className="rhvs-copy">
            <p>Where <a href="https://www.teamsnap.com/teams" target="_blank" rel="nofollow noopener">TeamSnap</a> is strong: 100+ sports, 30 million coaches, parents and players (its figure), practice plans, card invoicing, and registration, streaming and tournament tools for organizations.</p>
            <p>Where RosterHockey is different: it's hockey-only, with no ads and with RSVPs, team chat, stats and standings on Free. On Player Pro and Commissioner, a captain or coach sets line combos and RosterHockey predicts winning odds, score, points and player production before each game, from team and player history. See <a href="/line-combos-predictions">/line-combos-predictions</a>. Commissioner adds league drafts, bracket generation and tournaments mode.</p>
            <p>Payments: RosterHockey doesn't process payments in the app. It tracks dues and ice fees, sends payment requests and links to Venmo or CashApp.</p>
          </div>
        </div>
      </section>

      <section className="lc-section lc-section--blue">
        <div className="lc-container">
          <h2 className="lc-heading">Switching from TeamSnap</h2>
          <ol className="rhvs-switch-list">
            <li>Get RosterHockey on the <a href="https://apps.apple.com/us/app/roster-hockey/id6756852981" target="_blank" rel="noopener noreferrer">App Store</a>, <a href="https://play.google.com/store/apps/details?id=com.aFFhvtIzJvyF.natively" target="_blank" rel="noopener noreferrer">Google Play</a> or the web.</li>
            <li>Create your team and invite your roster.</li>
            <li>Add your schedule and RSVPs.</li>
            <li>Set dues and link Venmo or CashApp.</li>
            <li>Upgrade to Player Pro or Commissioner for line combos and predictions.</li>
          </ol>
        </div>
      </section>

      <section className="lc-section lc-section--white" aria-labelledby="rhvs-faq-heading">
        <div className="lc-container">
          <h2 className="lc-heading" id="rhvs-faq-heading">FAQ</h2>
          <div className="lc-faq-list">
            {teamSnapFaqs.map(({ question, answer }) => (
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
          <p className="rhvs-also-compare">Also compare: <a href="/rosterhockey-vs-benchapp">RosterHockey vs BenchApp</a>.</p>
        </div>
      </section>

      <RosterPageFooter />
    </main>
  );
}

export default RosterHockeyVsTeamSnapPage;
