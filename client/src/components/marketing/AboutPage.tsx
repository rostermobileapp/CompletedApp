import { useSeo } from "@/hooks/useSeo";
import { useState } from "react";
import { ArrowRight, CheckCircle2, MessageSquare, Users } from "lucide-react";
import { RosterPageFooter, RosterPageNav } from "./RosterPageNav";
import "./AboutPage.css";

const processNotes = [
  { icon: Users, number: "100+", label: "Players & captains interviewed", text: "Tobin sat down with beer leaguers, recreational players, and league commissioners to understand what actually went wrong every week — not what looked good in a feature list." },
  { icon: MessageSquare, number: "4", label: "Competing apps tested in full", text: "He ran his own league through every major app on the market for at least one season. He documented what worked, what failed, and what drove his players crazy." },
  { icon: CheckCircle2, number: "3", label: "Beta leagues before launch", text: "Before the public launch, three real leagues used Roster through a full season. Every bug, workflow gap, and confusing screen was fixed based on real feedback." },
];

export function AboutPage() {
  useSeo({ title: "About | Roster — Built for Hockey", description: "Meet the people and the hockey community behind Roster, the ad-free hockey team and league management app." });
  const [showEasterEgg, setShowEasterEgg] = useState(false);
  return (
    <main className="rp-page ap-page">
      <RosterPageNav active="about" />
      <section className="ap-founder">
        <div className="ap-container ap-founder-layout">
          <button className="ap-founder-photo" aria-label={showEasterEgg ? "Show founder portrait" : "Show alternate founder photo"} onClick={() => setShowEasterEgg(value => !value)}>
            <img src={`/marketing/${showEasterEgg ? "roster-about-easter-egg.jpg" : "roster-about-founder.png"}`} alt="Tobin K., Roster founder, on the ice" />
            <span>{showEasterEgg ? "Founder portrait" : "From the rink"}</span>
          </button>
          <div className="ap-intro">
            <span className="rp-kicker">The story behind Roster</span>
            <h1 className="rp-title">Built by a player.<br /><em>For the people.</em></h1>
            <h2>Tobin K. <span>· Hockey player, lifetime beer league member</span></h2>
            <p>I didn’t set out to build a software company. I set out to build an app for the hockey community with the added benefit of never wondering if we had enough players.</p>
            <blockquote><strong>“You’d be amazed at how much admin work there is to do as Commissioner”</strong><cite>Brian · Tobin’s league commissioner</cite></blockquote>
            <div className="ap-origin-stats"><div><strong>10</strong><span>Years with a BenchApp account before building Roster</span></div><div><strong>4</strong><span>Apps tested before deciding to build his own</span></div></div>
          </div>
        </div>
      </section>

      <section className="ap-origin">
        <div className="ap-container ap-origin-layout">
          <div><span className="rp-kicker">The Origin</span><h2 className="rp-title rp-title-sm">Why I built<br />Roster.</h2></div>
          <div className="ap-origin-copy">
            <p>Since 2016 we used a different app for the teams. It worked well for surface-level items like calendar and planning. But as I moved into a more community-oriented league with fantastic people, I realized that we could benefit from a more personal app experience.</p>
            <p>Our league used everything. Excel for schedules and drafts, esportsdesk for standings and player stats, team text threads. Nothing solved the actual problem: <em>having one app for everything… literally everything.</em></p>
            <p>So while driving back to Ohio from our annual family vacation, I planned out Roster. Four months later, some of the players had a working beta app to test.</p>
          </div>
        </div>
      </section>

      <section className="ap-process">
        <div className="ap-container">
          <div className="ap-process-heading"><span className="rp-kicker">The Process</span><h2 className="rp-title rp-title-sm">Built with the<br />whole bench.</h2><p>Roster wasn’t built in isolation. I spent a full season talking to captains, coaches, and commissioners before release.</p></div>
          <div className="ap-process-grid">{processNotes.map(({ icon: Icon, number, label, text }) => <article key={label}><span className="ap-process-icon"><Icon size={20} /></span><strong className="ap-process-number">{number}</strong><h3>{label}</h3><p>{text}</p></article>)}</div>
          <div className="ap-conclusion"><CheckCircle2 size={21} /><p>The result is an app that’s built around how recreational hockey actually works — not how a product manager imagined it might work. Every feature in Roster exists because a real captain asked for it, struggled without it, or wasted time working around the fact that it didn’t exist.</p></div>
        </div>
      </section>

      <section className="ap-last"><div className="ap-container"><span className="rp-kicker">The game comes first</span><h2 className="rp-title rp-title-sm">Less time managing.<br />More time together.</h2><a href="/features" className="rp-primary-link">See what Roster does <ArrowRight size={16} /></a></div></section>
      <RosterPageFooter />
    </main>
  );
}
