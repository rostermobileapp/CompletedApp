import type { PointerEvent } from "react";
import { useSeo } from "@/hooks/useSeo";
import { RosterPageFooter, RosterPageNav } from "../RosterPageNav";
import "./LineCombosPage.css";

export const lineCombosFaqs = [
  {
    question: "Which plan includes line combos and predictions?",
    answer: "Player Pro and Commissioner. They aren't on the Free plan.",
  },
  {
    question: "How do the predictions work?",
    answer: "A captain or coach sets the lines. Before each game, RosterHockey generates winning odds, points, score and player production predictions from team and player history. They're estimates, not guarantees.",
  },
  {
    question: "Do predictions update during the game?",
    answer: "No. They're pre-game only. After the game, the scoresheet and standings show what happened.",
  },
  {
    question: "How is this different from BenchApp or TeamSnap?",
    answer: "Both have lineup builders. RosterHockey adds pre-game winning odds, score, points and player production predictions, and it's hockey-only with no ads.",
  },
  {
    question: "How is this different from Rosterlytic Line Chemistry?",
    answer: "Line Chemistry scores how player combos performed in past games. RosterHockey predicts the upcoming game. Different tools.",
  },
  {
    question: "Is RosterHockey only for hockey?",
    answer: "Yes. It's built for beer league, adult rec, youth and varsity hockey.",
  },
] as const;

function RosterPhone({ variant, priority = false }: { variant: "home" | "odds"; priority?: boolean }) {
  const alt = variant === "home"
    ? "RosterHockey home screen showing the team's pre-game chance of winning"
    : "RosterHockey game odds screen with pre-game winning odds and score predictions";
  const stem = variant === "home" ? "rh-home-win-chance" : "rh-game-odds";
  return (
    <div className={`lc-phone${variant === "odds" ? " lc-phone--odds" : ""}`}>
      <picture>
        <source srcSet={`/images/line-combos/${stem}.webp`} type="image/webp" />
        <img
          src={`/images/line-combos/${stem}.png`}
          width="530"
          height="1190"
          alt={alt}
          loading={priority ? "eager" : "lazy"}
        />
      </picture>
    </div>
  );
}

export function LineCombosPage() {
  useSeo({
    title: "Line Combos, Score Predictions & Winning Odds | RosterHockey",
    description: "RosterHockey line combos and pre-game score, points, production and winning-odds predictions. Player Pro and Commissioner — like having a coach in your pocket.",
    canonical: "/line-combos-predictions",
    ogImage: "/images/line-combos/og-line-combos.png",
  });

  const handleParallax = (event: PointerEvent<HTMLDivElement>) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 8;
    const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * 7;
    event.currentTarget.style.setProperty("--lc-x", `${x}px`);
    event.currentTarget.style.setProperty("--lc-y", `${y}px`);
  };
  const resetParallax = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.style.setProperty("--lc-x", "0px");
    event.currentTarget.style.setProperty("--lc-y", "0px");
  };

  return (
    <main className="rp-page lc-page">
      <RosterPageNav active="line-combos" />
      <section className="lc-hero">
        <div className="lc-container">
          <div className="lc-hero-copy">
            <h1 className="lc-title">RosterHockey line combos, score predictions and winning odds</h1>
            <p>RosterHockey is the hockey team and league app that gives captains and coaches line combos plus pre-game predictions for winning odds, score, points and player production — like having a coach in your pocket.</p>
            <p>On Player Pro and Commissioner, a captain or coach sets line combos, then RosterHockey generates pre-game predictions from team and player history. It all lives in the same ad-free hockey app that handles RSVPs, scorekeeping, stats and standings.</p>
            <div className="lc-hero-actions">
              <a className="lc-button" href="https://www.roster-app.com/get-started">Get started</a>
              <a className="lc-button lc-button--quiet" href="https://www.roster-app.com/login">Log in</a>
            </div>
          </div>
          <div className="lc-hero-art" role="group" aria-label="RosterHockey app previews" onPointerMove={handleParallax} onPointerLeave={resetParallax}>
            <div className="lc-glow" aria-hidden="true" />
            <div className="lc-phone-wrap lc-phone-wrap--home"><RosterPhone variant="home" priority /></div>
            <div className="lc-phone-wrap lc-phone-wrap--odds"><RosterPhone variant="odds" /></div>
            <span className="lc-callout">Pre-game winning odds</span>
          </div>
        </div>
      </section>

      <section className="lc-section lc-section--white">
        <div className="lc-container lc-two-col">
          <div>
            <h2 className="lc-heading">Line combos</h2>
            <p className="lc-body">A captain or coach sets the lines so the team sees who's skating together before puck drop — no more rebuilding the lineup in a text thread on the way to the rink. You set them manually, right next to your roster and attendance.</p>
          </div>
          <div className="lc-line-art" aria-hidden="true">
            <span className="lc-rink-mark" /><span className="lc-rink-mark lc-rink-mark--red" />
            <div className="lc-line-stack">
              <div className="lc-line-row"><span>1</span><i /></div>
              <div className="lc-line-row"><span>2</span><i /></div>
              <div className="lc-line-row"><span>3</span><i /></div>
            </div>
          </div>
        </div>
      </section>

      <section className="lc-section lc-section--blue">
        <div className="lc-container lc-prediction-layout">
          <div className="lc-prediction-phone">
            <div className="lc-phone-wrap"><RosterPhone variant="odds" /></div>
          </div>
          <div>
            <h2 className="lc-heading">Pre-game predictions</h2>
            <p className="lc-body">Before each game, RosterHockey generates:</p>
            <ul className="lc-prediction-list">
              <li>Winning odds</li>
              <li>Points predictions</li>
              <li>Score predictions</li>
              <li>Player production predictions</li>
            </ul>
            <p className="lc-note">They're estimates based on team and player history, not guarantees, and they don't update live during the game.</p>
          </div>
        </div>
      </section>

      <section className="lc-section lc-section--white">
        <div className="lc-container">
          <div className="lc-section-heading">
            <h2 className="lc-heading">Who it's for</h2>
          </div>
          <div className="lc-audience-grid">
            <article className="lc-audience"><p>Captains and coaches: walk into the rink with a plan, not a group chat.</p></article>
            <article className="lc-audience"><p>Commissioners: included with Commissioner, alongside scorekeeping, standings and brackets.</p></article>
            <article className="lc-audience"><p>Players: included with Player Pro.</p></article>
          </div>
        </div>
      </section>

      <section className="lc-section lc-section--blue">
        <div className="lc-container lc-comparison">
          <div>
            <h2 className="lc-heading">How RosterHockey compares</h2>
          </div>
          <div className="lc-compare-note">
            <div className="lc-compare-rule" />
            <p>BenchApp and TeamSnap offer lineup builders. Rosterlytic scores line chemistry from past games. RosterHockey's difference is pre-game predictions — winning odds, score, points and player production — which none of them describe on their public feature pages.</p>
          </div>
        </div>
      </section>

      <section className="lc-section lc-section--white">
        <div className="lc-container">
          <div className="lc-section-heading">
            <h2 className="lc-heading">Plans</h2>
          </div>
          <p className="lc-body">Included with Player Pro ($6.49/mo or $64.99/yr) and Commissioner ($12/mo or $119.99/yr).</p>
          <div className="lc-plans">
            <article className="lc-plan"><h3>Player Pro</h3><strong>$6.49/mo or $64.99/yr</strong></article>
            <article className="lc-plan lc-plan--featured"><h3>Commissioner</h3><strong>$12/mo or $119.99/yr</strong></article>
          </div>
          <p className="lc-free-note">Not included on the Free plan, which stays free forever with no ads.</p>
        </div>
      </section>

      <section className="lc-section lc-section--blue" aria-labelledby="lc-faq-heading">
        <div className="lc-container">
          <div className="lc-section-heading">
            <h2 className="lc-heading" id="lc-faq-heading">FAQ</h2>
          </div>
          <div className="lc-faq-list">
            {lineCombosFaqs.map(({ question, answer }) => (
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
          <p>Download RosterHockey for iOS or Android, or start Player Pro or Commissioner to use line combos and predictions.</p>
          <div className="lc-store-links">
            <a className="lc-button" href="https://apps.apple.com/us/app/roster-hockey/id6756852981">App Store</a>
            <a className="lc-button lc-button--quiet" href="https://play.google.com/store/apps/details?id=com.aFFhvtIzJvyF.natively">Google Play</a>
            <a className="lc-button lc-button--quiet" href="https://www.roster-app.com/get-started">Get started</a>
          </div>
        </div>
      </section>
      <RosterPageFooter />
    </main>
  );
}

export default LineCombosPage;
