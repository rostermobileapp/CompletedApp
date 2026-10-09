import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight, Menu, X } from "lucide-react";
import { SiAppstore, SiGoogleplay } from "react-icons/si";
import { useLocation } from "wouter";
import { useSeo } from "@/hooks/useSeo";
import { useMarketingVisit } from "./useMarketingVisit";
import { useIsIosDevice } from "@/hooks/useIosPlatform";
import "./ScrollStory.css";

const image = (name: string) => `/marketing/roster-home/${name}`;
const signupDestination = "/get-started";
const appStore = "https://apps.apple.com/us/app/roster-hockey/id6756852981";
const playStore = "https://play.google.com/store/apps/details?id=com.aFFhvtIzJvyF.natively&utm_source=na_Med";
const patchItems = [
  ["hat-trick", "Hat Trick"], ["beer-me", "Beer Me"], ["iron-man", "Iron Man"],
  ["on-fire", "On Fire"], ["century-club", "Century Club"], ["locked-in", "Locked In"],
  ["three-stars", "Three Stars"],
];
const questions = [
  { q: "Which franchise won the first Stanley Cup in 1893?", answers: ["Montreal Hockey Club", "Ottawa Senators", "Quebec Bulldogs"], right: "Montreal Hockey Club" },
  { q: "Which team is known as the Original Six franchise from Detroit?", answers: ["Red Wings", "Blackhawks", "Rangers"], right: "Red Wings" },
  { q: "What is the name of the trophy awarded to the NHL’s top goaltender?", answers: ["Vezina Trophy", "Norris Trophy", "Selke Trophy"], right: "Vezina Trophy" },
];
const gallery = [
  ["scorekeeper-preview.png", "Keep the game moving. Track the action from the bench."],
  ["standings-preview.png", "A season’s picture, without a spreadsheet scavenger hunt."],
  ["payments-preview.png", "Team payments and expenses live with the team."],
  ["messaging-preview.png", "The right hockey conversation, in the right place."],
];
function ScrollStory() {
  const [, navigate] = useLocation();
  const isIos = useIsIosDevice();
  useMarketingVisit();
  useSeo({ title: "Roster — Hockey Team Management App", description: "More time together. Less time on admin. Roster handles hockey schedules, RSVPs, rosters, stats, and payments in one ad-free app. Free to start." });
  const rootRef = useRef<HTMLDivElement>(null);
  const benefitRef = useRef<HTMLDivElement>(null);
  const [benefitProgress, setBenefitProgress] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answerState, setAnswerState] = useState("");
  const reduced = useRef(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    const draw = () => {
      frame = 0;
      const sectionProgress = (element: HTMLElement | null) => {
        if (!element || media.matches) return 1;
        const rect = element.getBoundingClientRect();
        return Math.min(1, Math.max(0, (window.innerHeight * .2 - rect.top) /
          Math.max(window.innerHeight * .55, rect.height - window.innerHeight * .7)));
      };
      setBenefitProgress(sectionProgress(benefitRef.current));
    };
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(draw); };
    const updatePreference = () => { reduced.current = media.matches; draw(); };
    reduced.current = media.matches;
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    media.addEventListener("change", updatePreference);
    draw();
    if (window.location.hash) {
      const id = decodeURIComponent(window.location.hash.slice(1));
      rootRef.current?.querySelector<HTMLElement>(`[id="${CSS.escape(id)}"]`)?.scrollIntoView();
    }
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      media.removeEventListener("change", updatePreference);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let cleanupMotion = () => {};
    const setupMotion = () => {
      cleanupMotion();
      if (media.matches) return;
      let frame = 0;
      const rows = Array.from(rootRef.current?.querySelectorAll<HTMLElement>(".rs-marquee") ?? []);
      const galleryTrack = rootRef.current?.querySelector<HTMLElement>(".rs-gallery-track");
      const draw = () => {
        rows.forEach((row, i) => {
          const distance = window.innerHeight - row.getBoundingClientRect().top;
          const shift = -row.scrollWidth / 3 + (i % 2 ? -1 : 1) * distance * .095;
          row.style.transform = `translate3d(${shift}px,0,0)`;
        });
        if (galleryTrack) {
          const distance = window.innerHeight - galleryTrack.getBoundingClientRect().top;
          galleryTrack.style.transform = `translate3d(${-(Math.max(0, distance) * .07)}px,0,0)`;
        }
        frame = 0;
      };
      const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(draw); };
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
      draw();
      cleanupMotion = () => {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
        if (frame) window.cancelAnimationFrame(frame);
        rows.forEach(row => { row.style.transform = ""; });
        if (galleryTrack) galleryTrack.style.transform = "";
      };
    };
    media.addEventListener("change", setupMotion);
    setupMotion();
    return () => {
      media.removeEventListener("change", setupMotion);
      cleanupMotion();
    };
  }, []);

  const jumpTo = (id: string) => { setMenuOpen(false); document.getElementById(id)?.scrollIntoView({ behavior: reduced.current ? "auto" : "smooth" }); };
  const current = questions[questionIndex];
  const impactStages = ["GROUP CHAT", "CLEAR LINEUP", "GAME ON"];
  const impactLabel = impactStages[Math.min(2, Math.floor(benefitProgress * impactStages.length))];

  return (
    <main className="roster-scroll" ref={rootRef}>
      <header className="rs-nav">
        <a href="#top" className="rs-logo" aria-label="Roster home" onClick={(event) => { event.preventDefault(); jumpTo("top"); }}>
          <img src={image("logo-dark.png")} alt="Roster" />
        </a>
        <nav className="rs-nav-links" aria-label="Main navigation">
          <a href="/features">Features</a>
          <a href="/pricing">Pricing</a>
          <a href="/about">About</a>
          <a href="/referral-program">Partners</a>
        </nav>
        <button className="rs-nav-cta" onClick={() => navigate(signupDestination)}>Get started <ArrowRight size={15} /></button>
        <button className="rs-nav-toggle" aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
        {menuOpen && <nav className="rs-mobile-menu" aria-label="Mobile navigation">
          {[
            ["features", "/features"],
            ["pricing", "/pricing"],
            ["about", "/about"],
            ["partners", "/referral-program"],
          ].map(([label, href]) => <a key={label} href={href} onClick={() => setMenuOpen(false)}>{label[0].toUpperCase() + label.slice(1)}</a>)}
          <a href="#start" onClick={(e) => { e.preventDefault(); setMenuOpen(false); jumpTo("start"); }}>Get started</a>
        </nav>}
      </header>

      <section className="rs-hero" id="top">
        <img
          className="rs-hero-photo"
          src={image("roster-home-friends.jpg")}
          alt="Hockey teammates sharing a relaxed laugh and catching up outside the arena."
          loading="eager"
        />
        <h1 className="rs-hero-title mt-[1px] text-[#ffffff]">More time together.<br /><span>Less time on admin.</span></h1>
        <p className="rs-hero-copy text-[#ffffff] font-semibold">When the game ends, the memories begin. Roster handles the admin, so you can enjoy the parking lot party.</p>
        <div className="rs-hero-actions">
          <button className="rs-button" onClick={() => navigate(signupDestination)}>Bring your team together <ArrowRight size={16} /></button>
          <button className="rs-button secondary" onClick={() => navigate("/login")}>Log in</button>
        </div>
        <p className="rs-micro">No ads. Free forever tier available. No credit card required.</p>
        <a className="rs-sr-only" href="#team">Scroll to the story</a>
        <span className="rs-eyebrow" aria-hidden="true" style={{ marginTop: 15 }}>Keep the good part going <ArrowDown size={13} /></span>
      </section>

      <section className="rs-story-scene" id="team">
        <div className="rs-section rs-story">
        <div className="rs-story-copy">
          <div className="rs-section-kicker">The old routine</div>
          <h2 className="rs-display">Hockey has enough moving parts.</h2>
          <p className="rs-copy">A real management toolkit for teams who want to spend less time coordinating and more time playing. Schedules, RSVPs, roster, stats, payments, messaging and smart brackets work together—without ads.</p>
          <ul className="rs-feature-list">
            <li>Team schedules, attendance and player subs</li>
            <li>Stats, scorekeeping, standings and tournaments</li>
            <li>Payments, expenses, messaging and team updates</li>
          </ul>
        </div>
        <div className="rs-split-art">
          <img src={image("features-phones.png")} alt="Roster app screens for organizing a team" />
          <div className="rs-caption">One app. Your team. Back to hockey.</div>
        </div>
        </div>
      </section>

      <section className="rs-section rs-white" id="features">
        <div className="rs-section-inner rs-platform">
          <div>
            <div className="rs-section-kicker">The whole season, in one place</div>
            <h2 className="rs-display">The team stuff.<br />Handled.</h2>
            <p className="rs-copy">A real management toolkit for teams who want to spend less time coordinating and more time playing. Schedules, RSVPs, roster, stats, payments, messaging and smart brackets work together—without ads.</p>
            <div className="rs-platform-list">
              <div>Team schedules, attendance and player subs</div>
              <div>Stats, scorekeeping, standings and tournaments</div>
              <div>Payments, expenses, messaging and team updates</div>
            </div>
          </div>
          <img src={image("features-phones.png")} alt="Roster scheduling, team and player management screens" />
        </div>
      </section>

      <section className="rs-section rs-pricing" id="pricing">
        <div className="rs-section-inner rs-pricing-layout">
          <div className="rs-pricing-intro">
            <div className="rs-section-kicker">Clear access. No surprises.</div>
            <h2 className="rs-display">Start free.<br />Find your<br />next level.</h2>
            <p className="rs-copy">Roster has a free-forever tier, with no ads. Compare Player Pro and Commissioner plans to find the right fit for your team.</p>
            <div className="rs-store-links">
              <a className="rs-button" href={appStore} target="_blank" rel="noreferrer"><SiAppstore size={18} /> App Store</a>
              {!isIos && <a className="rs-button secondary" href={playStore} target="_blank" rel="noreferrer"><SiGoogleplay size={18} /> Google Play</a>}
            </div>
          </div>
          <div className="rs-pricing-details">
            <div className="rs-price-row">
              <span className="rs-price-tier">Free, forever</span>
              <strong>Play more. Coordinate less.</strong>
              <p>Daily hockey trivia and your personal beer counter are free. Patch progress builds on every plan.</p>
            </div>
            <div className="rs-price-row rs-price-featured">
              <span className="rs-price-tier">Player Pro or Commissioner</span>
              <strong>The full Trophy Case</strong>
              <p>Full Trophy Case access and patch artwork are part of paid access. Paid artwork requires verified age 21+.</p>
            </div>
            <a className="rs-button secondary" href="/pricing">Compare plans <ArrowRight size={16} /></a>
          </div>
        </div>
      </section>

      <section className="rs-section rs-about" id="about">
        <div className="rs-section-inner rs-about-layout">
          <div>
            <div className="rs-section-kicker">About Roster</div>
            <h2 className="rs-display">Built around<br />the game.</h2>
          </div>
          <div className="rs-about-copy">
            <p className="rs-about-lede">Hockey should take up your time on the ice—not every minute around it.</p>
            <p className="rs-copy">Roster brings schedules, attendance, team communication, payments, and game-day tools into one shared place. Fewer “who’s in?” messages. More time with the people who make the season.</p>
            <a className="rs-text-link" href="/features">Take a look at the features <ArrowRight size={16} /></a>
          </div>
        </div>
      </section>

      <section className="rs-section rs-product-band">
        <div className="rs-section-inner">
          <div className="rs-product-top">
            <div>
              <div className="rs-section-kicker">A better bench-to-bench rhythm</div>
              <h2 className="rs-display">Run the team.<br />Not the group chat.</h2>
            </div>
            <p className="rs-copy">From the first RSVP to the final score, give every teammate the same clear view of what’s happening next.</p>
          </div>
          <img className="rs-product-image" src={image("scorekeeper-preview.png")} alt="Roster in-game scorekeeping screen" />
        </div>
      </section>

      <div className="rs-benefit-scene" ref={benefitRef}>
      <section className="rs-section rs-benefit" aria-label="What the team gets back">
        <div className="rs-section-inner rs-benefit-inner">
          <div className="rs-benefit-copy">
            <div className="rs-section-kicker">Less time herding. More time here.</div>
            <h2 className="rs-display">Make room<br />for the game.</h2>
            <p className="rs-copy">The best part isn’t another dashboard. It’s knowing the lineup, the plan, and the score—then putting the phone away.</p>
            <div className="rs-meter"><span>Where the focus goes</span><strong>{impactLabel}</strong></div>
          </div>
          <div className="rs-feature-art">
            <img src={image("standings-preview.png")} alt="Roster standings screen for a hockey season" />
            <div className="rs-badge"><strong>Clear season picture</strong>Illustrative preview screen</div>
          </div>
        </div>
      </section>
      </div>

      <section className="rs-section rs-patches" id="patches">
        <div className="rs-patches-head">
          <div className="rs-section-kicker">A little friendly bragging rights</div>
          <h2 className="rs-display">Earn your<br />team lore.</h2>
           <p className="rs-copy">Collectible patches make the season more fun. Build patch progress on every plan. Hat Trick follows the season; Beer Me resets January 1. Unlock the full Trophy Case and patch artwork with Player Pro or Commissioner access and verified age 21+.</p>
        </div>
        {[0, 1].map((row) => <div className="rs-marquee-wrap" key={row}>
          <div className="rs-marquee" aria-label="Illustrative Roster patch collection" style={{ marginLeft: row ? "-8vw" : "-3vw" }}>
            {[...patchItems, ...patchItems, ...patchItems].map(([slug, title], i) =>
              <img key={`${row}-${slug}-${i}`} src={`/marketing/roster-home/badges/${slug}/tier-1.webp`} alt={i < patchItems.length ? `${title} patch` : ""} aria-hidden={i >= patchItems.length} />,
            )}
          </div>
        </div>)}
        <p className="rs-patch-note">The gallery is illustrative; real Trophy Case artwork is part of paid access.</p>
      </section>

      <section className="rs-section rs-trivia" id="trivia">
        <div className="rs-section-inner rs-trivia-grid">
          <div>
            <div className="rs-section-kicker">One fresh question, every day</div>
            <h2 className="rs-display">Keep your<br />hockey brain<br />in the game.</h2>
            <p className="rs-copy">Daily hockey trivia is free to play. Test what you know, discover something new, and build lifetime trivia patch progress on every plan.</p>
          </div>
          <div className="rs-question">
            <div className="rs-question-label">Illustrative question · {questionIndex + 1} of {questions.length}</div>
            <h3>{current.q}</h3>
             {current.answers.map((answer) => <button key={answer} className={`rs-answer${answerState === answer ? answer === current.right ? " is-correct" : " is-incorrect" : ""}`} aria-pressed={answerState === answer} onClick={() => setAnswerState(answer)}>{answer}</button>)}
             <div className={`rs-demo-result${answerState ? answerState === current.right ? " is-correct" : " is-incorrect" : ""}`} role="status" aria-live="polite">
              {answerState ? answerState === current.right ? "That’s right — nice pull." : "Not this time. The answer is " + current.right + "." : "Tap an answer to try this demo question."}
            </div>
            <button className="rs-button secondary" style={{ marginTop: 8, minHeight: 44 }} onClick={() => { setQuestionIndex((questionIndex + 1) % questions.length); setAnswerState(""); }}>Next demo question <ArrowRight size={15} /></button>
          </div>
        </div>
      </section>

      <section className="rs-gallery" aria-label="More Roster app screens">
        <div className="rs-gallery-head">
          <div className="rs-section-kicker">Made for the whole bench</div>
          <h2 className="rs-display">The details<br />stay together.</h2>
        </div>
        <div className="rs-gallery-track">
          {[...gallery, ...gallery].map(([src, caption], i) => <article className="rs-gallery-card" key={`${src}-${i}`}>
            <img src={image(src)} alt={caption} />
            <span>{caption}</span>
          </article>)}
        </div>
      </section>

      <section className="rs-section rs-white" aria-label="Seasonal bonus">
        <div className="rs-section-inner rs-platform">
          <div>
            <div className="rs-section-kicker">The fun stuff is part of team culture</div>
            <h2 className="rs-display">Keep score<br />off the ice, too.</h2>
             <p className="rs-copy">Track your post-game beers with the free personal counter. Beer Me patch progress starts fresh each January 1. For adult players; enjoy responsibly. Full Trophy Case access and patch artwork require Player Pro or Commissioner access and verified age 21+.</p>
          </div>
          <div className="rs-question" style={{ background: "#f3f8fd", color: "#0a1b2e", borderColor: "#bfd4e8" }}>
            <div className="rs-question-label">Patch preview</div>
            <img src="/marketing/roster-home/badges/hat-trick/tier-1.webp" alt="Hat Trick collectible patch artwork preview" style={{ width: "78%", display: "block", margin: "8px auto" }} />
            <div style={{ textAlign: "center", color: "#526c85", fontSize: 12 }}>Hat Trick is a seasonal badge.</div>
          </div>
        </div>
      </section>

      <section className="rs-section rs-partners" id="partners">
        <div className="rs-section-inner rs-partners-layout">
          <div>
            <div className="rs-section-kicker">For the whole hockey community</div>
            <h2 className="rs-display">Good teams<br />start together.</h2>
          </div>
          <div className="rs-partners-copy">
            <p className="rs-copy">Leagues, arenas, and hockey organizations help make the game possible. Roster gives the teams in your community one place to organize the season and stay connected.</p>
            <a className="rs-button" href="/referral-program">Explore a Roster partnership <ArrowRight size={16} /></a>
          </div>
        </div>
      </section>

      <section className="rs-section rs-final" id="start">
        <div className="rs-section-inner">
          <div className="rs-eyebrow">Built for hockey. Ad-free. Always.</div>
          <h2 className="rs-display">Let’s get<br />back to hockey.</h2>
          <p className="rs-copy">Bring your team together, keep the season in step, and save the admin for the app.</p>
          <div className="rs-hero-actions">
            <button className="rs-button" onClick={() => navigate(signupDestination)}>Get started <ArrowRight size={16} /></button>
            <a className="rs-button secondary" href={appStore} target="_blank" rel="noreferrer"><SiAppstore size={19} /> App Store</a>
            {!isIos && <a className="rs-button secondary" href={playStore} target="_blank" rel="noreferrer"><SiGoogleplay size={18} /> Google Play</a>}
          </div>
          <p className="rs-micro">Download Roster and bring your team together.</p>
        </div>
      </section>
      <footer className="rs-footer">
        <div className="rs-footer-inner">
          <a href="#top" onClick={(e) => { e.preventDefault(); jumpTo("top"); }}><img src={image("logo-dark.png")} alt="Roster" style={{ width: 96, height: 34, objectFit: "contain" }} /></a>
          <div className="rs-footer-links">
          <a href="/features">Features</a>
          <a href="/pricing">Pricing</a>
          <a href="/about">About</a>
          <a href="/referral-program">Partners</a>
            <a href="#patches" onClick={(e) => { e.preventDefault(); jumpTo("patches"); }}>Patches</a>
            <a href="#trivia" onClick={(e) => { e.preventDefault(); jumpTo("trivia"); }}>Trivia</a>
            <a href={appStore} target="_blank" rel="noreferrer">App Store</a>
            {!isIos && <a href={playStore} target="_blank" rel="noreferrer">Google Play</a>}
            <a href="/terms-of-service">Terms</a>
            <a href="/privacy-policy">Privacy</a>
            <a href="/support">Support</a>
          </div>
          <span>Ad-free hockey team management.</span>
        </div>
      </footer>
    </main>
  );
}

export default ScrollStory;
