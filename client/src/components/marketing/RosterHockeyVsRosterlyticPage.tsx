import { useSeo } from "@/hooks/useSeo";
import { RosterPageFooter, RosterPageNav } from "./RosterPageNav";
import "./line-combos/LineCombosPage.css";
import "./RosterHockeyVsTeamSnapPage.css";

export const rosterlyticFaqs = [
  {
    question: "What's the difference between Line Chemistry and RosterHockey predictions?",
    answer: "Line Chemistry scores how player combinations performed in past games. RosterHockey predicts the upcoming game: winning odds, score, points and player production.",
  },
  {
    question: "Which is cheaper?",
    answer: "Rosterlytic. Its Team plan is $1.99/mo and League is $9.99/mo. RosterHockey Player Pro is $6.49/mo per player, and one $12/mo Commissioner runs a whole league.",
  },
  {
    question: "Does either app have ads?",
    answer: "Rosterlytic Free is ad-supported; Team removes ads. RosterHockey has no ads on any plan.",
  },
  {
    question: "Can I collect dues by card?",
    answer: "Not in RosterHockey; it tracks dues and links to Venmo or CashApp. Rosterlytic lists fee tracking on League.",
  },
  {
    question: "Is Rosterlytic hockey-only?",
    answer: "No, it covers 9 sports. RosterHockey is hockey only.",
  },
  {
    question: "Does Rosterlytic predict game results?",
    answer: "Its public pages don't describe pre-game winning odds or score predictions. RosterHockey has them on Player Pro and Commissioner.",
  },
] as const;

const comparisonRows = [
  ["Sports", "Hockey only", "9 sports, including hockey"],
  ["Free plan", "Yes, no ads", "Yes, ad-supported"],
  ["Team plan", "Player Pro $6.49/mo or $64.99/yr per player", "Team $1.99/mo or $19.99/yr; ad-free for the roster"],
  ["League plan", "Commissioner $12/mo or $119.99/yr; one per league", "League $9.99/mo or $99.99/yr; up to 3 leagues of 8 teams"],
  ["Ads", "None on any plan", "On Free; removed with Team"],
  ["RSVPs", "Free", "Free"],
  ["Lines", "Line combos set by captain or coach (Player Pro, Commissioner)", "Lineup builder with suggested lines (Free)"],
  ["Line analytics", "Pre-game predictions: winning odds, score, points, player production", "Line Chemistry: synergy scores from past games"],
  ["Card payments in app", "No; tracks dues, links to Venmo or CashApp", "Not described on its public pages; fee tracking on League"],
  ["Standings and brackets", "Standings (Free); brackets (Commissioner)", "Standings; playoff brackets (League)"],
  ["League drafts", "Yes (Commissioner)", "Not described on its public pages"],
] as const;

export function RosterHockeyVsRosterlyticPage() {
  useSeo({
    title: "RosterHockey vs Rosterlytic: Hockey Line Combos & League App Comparison (2026)",
    description: "RosterHockey vs Rosterlytic, compared for beer league hockey: pricing, ads, lines, Line Chemistry vs pre-game predictions, payments and league tools. Updated November 2026.",
    canonical: "/rosterhockey-vs-rosterlytic",
  });

  return (
    <main className="rp-page lc-page rhvs-page">
      <RosterPageNav active="" />

      <section className="lc-hero rhvs-hero">
        <div className="lc-container">
          <div className="lc-hero-copy">
            <h1 className="lc-title">RosterHockey vs Rosterlytic</h1>
            <p>RosterHockey is a hockey-only team and league app with no ads on any plan and pre-game predictions; Rosterlytic is a 9-sport team and league app whose Line Chemistry scores how player combos did in past games.</p>
          </div>
        </div>
      </section>

      <section className="lc-section lc-section--white">
        <div className="lc-container">
          <h2 className="lc-heading">Quick verdict</h2>
          <p className="lc-body rhvs-verdict">Pick Rosterlytic for lower paid prices, multiple sports or historical line analytics. Pick RosterHockey for hockey-only, no ads on any plan, pre-game predictions, drafts and tournaments.</p>
        </div>
      </section>

      <section className="lc-section lc-section--blue">
        <div className="lc-container">
          <h2 className="lc-heading">Who should pick which</h2>
          <ul className="rhvs-pick-list">
            <li><strong>Rosterlytic:</strong> budget-minded captains, multi-sport rec groups, stat-heavy teams.</li>
            <li><strong>RosterHockey:</strong> beer league, adult rec, youth and varsity hockey; captains who want pre-game odds; commissioners running drafts or tournaments.</li>
          </ul>
        </div>
      </section>

      <section className="lc-section lc-section--white">
        <div className="lc-container">
          <h2 className="lc-heading">Comparison table</h2>
          <div className="rhvs-table-wrap" role="region" aria-label="RosterHockey and Rosterlytic feature comparison" tabIndex={0}>
            <table className="rhvs-table">
              <caption>As of November 2026, from each company's public pages.</caption>
              <thead>
                <tr>
                  <th scope="col">Feature</th>
                  <th scope="col">RosterHockey</th>
                  <th scope="col">Rosterlytic</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map(([feature, rosterHockey, rosterlytic]) => (
                  <tr key={feature}>
                    <th scope="row">{feature}</th>
                    <td>{rosterHockey}</td>
                    <td>{rosterlytic}</td>
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
            <p>Rosterlytic Free is $0 with ads and covers 1 league of up to 4 teams. Team is $1.99/mo or $19.99/yr and removes ads for the roster. League is $9.99/mo or $99.99/yr. Organization is $49.99/mo or $499.99/yr. Players never need their own subscription. See <a href="https://rosterlytic.com/pricing" target="_blank" rel="nofollow noopener">Rosterlytic pricing</a>.</p>
          </div>
        </div>
      </section>

      <section className="lc-section lc-section--white">
        <div className="lc-container">
          <h2 className="lc-heading">Feature differences</h2>
          <div className="rhvs-copy">
            <p>Where Rosterlytic is strong: low prices, lineups and stats on Free, 9 sports, and historical analytics (Line Chemistry, position grades, Win Impact).</p>
            <p>Where RosterHockey is different: it's hockey-only with no ads on any plan. Rosterlytic looks back; RosterHockey looks ahead. A captain or coach sets line combos and RosterHockey predicts winning odds, score, points and player production before each game, from team and player history. See <a href="/line-combos-predictions">/line-combos-predictions</a>. Commissioner adds league drafts, in-game scorekeeping, bracket generation and tournaments mode.</p>
            <p>Payments: RosterHockey doesn't process payments in the app. It tracks dues and ice fees and links to Venmo or CashApp.</p>
          </div>
        </div>
      </section>

      <section className="lc-section lc-section--blue">
        <div className="lc-container">
          <h2 className="lc-heading">Switching from Rosterlytic</h2>
          <ol className="rhvs-switch-list">
            <li>Get RosterHockey on the <a href="https://apps.apple.com/us/app/roster-hockey/id6756852981" target="_blank" rel="noopener noreferrer">App Store</a>, <a href="https://play.google.com/store/apps/details?id=com.aFFhvtIzJvyF.natively" target="_blank" rel="noopener noreferrer">Google Play</a> or the web.</li>
            <li>Create your team and invite your roster.</li>
            <li>Add your schedule and RSVPs.</li>
            <li>Set dues and link Venmo or CashApp.</li>
            <li>Upgrade to Player Pro or Commissioner for line combos and predictions.</li>
          </ol>
        </div>
      </section>

      <section className="lc-section lc-section--white" aria-labelledby="rhro-faq-heading">
        <div className="lc-container">
          <h2 className="lc-heading" id="rhro-faq-heading">FAQ</h2>
          <div className="lc-faq-list">
            {rosterlyticFaqs.map(({ question, answer }) => (
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
          <p className="rhvs-also-compare">Also compare: <a href="/rosterhockey-vs-benchapp">RosterHockey vs BenchApp</a>, <a href="/rosterhockey-vs-teamsnap">RosterHockey vs TeamSnap</a>.</p>
        </div>
      </section>

      <RosterPageFooter />
    </main>
  );
}

export default RosterHockeyVsRosterlyticPage;
