import { ArrowDown, ArrowRight, BarChart3, BellRing, CalendarDays, Check, ClipboardList, CreditCard, MessageCircle, ShieldCheck, Trophy, Users, Zap } from "lucide-react";
import { RosterPageFooter, RosterPageNav } from "./RosterPageNav";
import { AnimatedBracket } from "./_shared/AnimatedBracket";
import "./FeaturesPage.css";

const tournamentFeatures = [
  { icon: Trophy, title: "Smart Bracket Creator", text: "Drop in your teams, pick your format, and Roster builds the bracket in seconds. Single elim, double elim, round robin into playoffs — it knows what you’re trying to do." },
  { icon: Zap, title: "Brackets that advance themselves", text: "Score a game, the winner moves on. No commissioner sitting in the rink office updating a bracket on a clipboard. The next matchup is already on the schedule." },
  { icon: CreditCard, title: "Running a solo tournament?", text: "Use Roster for just that weekend at $10/team. Every player gets full paid access for the whole tournament." },
];
const seasonTools = [
  { icon: CalendarDays, name: "Team schedule", text: "Keep game times, attendance, and player subs together." },
  { icon: ClipboardList, name: "Live scorekeeping", text: "Goals, assists, penalties, and saves—tracked as the game happens." },
  { icon: BarChart3, name: "Standings that stay current", text: "Score the game in the app and standings update instantly." },
  { icon: MessageCircle, name: "Communication, one place", text: "Schedules, lineups, payments, announcements, and captain chats live inside Roster." },
  { icon: Users, name: "Roster management", text: "Player and attendance tracking helps the group know who’s in." },
  { icon: BellRing, name: "Registration and payments", text: "Players register, pay league dues, and sign waivers in one flow." },
];

export function FeaturesPage() {
  return (
    <main className="rp-page rp-features">
      <RosterPageNav active="features" />
      <section className="rp-feature-hero">
        <div className="rp-container">
          <span className="rp-kicker">Built for hockey leagues</span>
          <h1 className="rp-title">The whole season.<br /><em>One roster.</em></h1>
          <p>From the first registration to the last whistle, replace the scattered tools with one place to run your league and stay connected.</p>
          <a className="rp-primary-link" href="#season-tools">Explore the toolkit <ArrowDown size={16} /></a>
          <div className="rp-feature-art">
            <img src="/__mockup/images/roster-home/features-phones.png" alt="Roster app screens for payments, team chat, private skate scheduling, and in-game scorekeeping" />
            <span>Made for the people who keep hockey moving.</span>
          </div>
        </div>
      </section>

      <section className="rp-season-section" id="season-tools">
        <div className="rp-container">
          <div className="rp-section-heading">
            <div><span className="rp-kicker">One place, not four</span><h2 className="rp-title rp-title-sm">The team stuff.<br />Handled.</h2></div>
            <p>Four tools disappear into the background, so captains can get back to being teammates.</p>
          </div>
          <div className="rp-season-grid">
            {seasonTools.map(({ icon: Icon, name, text }, index) => (
              <article className="rp-season-card" key={name}>
                <span className="rp-card-index">0{index + 1}</span>
                <span className="rp-icon-box"><Icon size={21} /></span>
                <h3>{name}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="rp-tournament-section">
        <div className="rp-container rp-tournament-layout">
          <div>
            <span className="rp-kicker">Tournament mode</span>
            <h2 className="rp-title rp-title-sm">From bracket<br />to champion.</h2>
            <p className="rp-section-lede">Automated, tracked, and updated in real time.</p>
            <div className="rp-tournament-list">
              {tournamentFeatures.map(({ icon: Icon, title, text }) => <article key={title}><span className="rp-icon-box"><Icon size={20} /></span><div><h3>{title}</h3><p>{text}</p></div></article>)}
            </div>
          </div>
          <div className="rp-bracket-card">
            <div className="rp-bracket-head"><span>PLAYOFFS · LIVE</span><span className="rp-live-dot">UPDATING</span></div>
            <div className="rp-bracket-animation">
              <AnimatedBracket />
            </div>
            <div className="rp-bracket-foot"><Check size={15} /> Winner advances automatically when the game is scored.</div>
          </div>
        </div>
      </section>

      <section className="rp-draft-section">
        <div className="rp-container rp-draft-layout">
          <div className="rp-draft-orbit"><div className="rp-phone-shell"><div className="rp-phone-top" /><div className="rp-phone-screen"><span>DRAFT NIGHT · LIVE</span><strong>Choose your next teammate.</strong><div><b>ROUND 04</b><span>01:18</span></div><label>AVAILABLE PLAYERS</label><p>#18&nbsp; Jordan M. <i>LEFT WING</i></p><p>#07&nbsp; Casey R. <i>DEFENCE</i></p><p>#31&nbsp; Morgan T. <i>GOALIE</i></p><div className="rp-demo-pick">MAKE A PICK <ArrowRight size={14} /></div></div></div></div>
          <div><span className="rp-kicker">Exclusive to Roster</span><h2 className="rp-title rp-title-sm">Draft night<br />feels like an event.</h2><p>Give your players a real moment to look forward to, with the commissioner in control and every pick moving the room forward.</p><div className="rp-draft-points"><span><Check size={16} /> Captain READY lobby</span><span><Check size={16} /> Live pick clock with 30-second extension</span><span><Check size={16} /> Buddy groups to keep linemates together</span><span><Check size={16} /> Separate goalie round</span></div></div>
        </div>
      </section>

      <section className="rp-feature-close">
        <div className="rp-container"><ShieldCheck size={28} /><span className="rp-kicker">Hockey only. Built local. Ad-free.</span><h2 className="rp-title rp-title-sm">Less chasing.<br />More time together.</h2><a href="/__mockup/preview/roster-home/PricingPage" className="rp-primary-link">Compare plans <ArrowRight size={16} /></a></div>
      </section>
      <RosterPageFooter />
    </main>
  );
}
