import { useState } from "react";
import { ArrowRight, Beer, Check, CircleHelp, LockKeyhole, RotateCcw, Trophy } from "lucide-react";
import "./FunFeaturesShowcase.css";

const triviaOptions = ["Hart Trophy", "Art Ross Trophy", "Vezina Trophy", "Calder Trophy"];

export function FunFeaturesNudge() {
  return (
    <section className="fun-nudge" aria-label="Discover the fun side of Roster">
      <div className="fun-nudge-copy">
        <span className="fun-kicker">A little extra after the final buzzer</span>
        <p>Adult hockey extras: patches, post-game beer tracking, and daily trivia.</p>
      </div>
      <a href="/features#fun-features" className="fun-nudge-link">
        Explore the fun side <ArrowRight size={16} aria-hidden="true" />
      </a>
    </section>
  );
}

export default function FunFeaturesShowcase({ underFixedHeader = false }: { underFixedHeader?: boolean }) {
  const [answer, setAnswer] = useState<string | null>(null);
  const correctAnswer = "Art Ross Trophy";

  return (
    <section className={`fun-showcase${underFixedHeader ? " is-under-fixed-header" : ""}`} id="fun-features" aria-labelledby="fun-showcase-title">
      <div className="fun-showcase-inner">
        <div className="fun-showcase-heading">
          <div>
            <span className="fun-kicker">Built for the hockey life</span>
            <h2 id="fun-showcase-title">More than game night.</h2>
          </div>
          <p>Roster keeps the team together between puck drops, too. A little competition, a little ritual, and a few stories worth retelling.</p>
        </div>

        <div className="fun-feature-grid">
          <article className="fun-card fun-patches-card">
            <div className="fun-card-topline">
              <span className="fun-card-label"><Trophy size={15} aria-hidden="true" /> The Trophy Case</span>
              <span className="fun-stamp">Illustrative preview</span>
            </div>
            <div className="fun-patch-display">
              <div className="fun-patch-art">
                <img src="/badges/hat-trick/tier-1.webp" alt="Hat Trick patch artwork, tier one" />
              </div>
              <div className="fun-patch-copy">
                <span className="fun-overline">Seasonal patch</span>
                <h3>Hat Trick</h3>
                <p>Show up, light the lamp, and build a collection of season-earned keepsakes.</p>
                <div className="fun-tier-track" aria-label="Illustrative seasonal tier preview">
                  {[1, 2, 3, 4].map((tier) => (
                    <span key={tier} className={tier === 1 ? "is-current" : ""}>Tier {tier}</span>
                  ))}
                </div>
              </div>
            </div>
            <div className="fun-access-note">
              <LockKeyhole size={14} aria-hidden="true" />
              <span>Full Trophy Case and patch artwork require Player Pro or Commissioner access and age 21+.</span>
            </div>
          </article>

          <article className="fun-card fun-beer-card">
            <div className="fun-card-topline">
              <span className="fun-card-label"><Beer size={16} aria-hidden="true" /> Beer Me</span>
              <span className="fun-21">21+</span>
            </div>
            <div className="fun-beer-art">
              <img src="/badges/beer-me/tier-1.webp" alt="Beer Me patch artwork, tier one" />
              <div className="fun-tally" aria-label="Illustrative counter interface, no real count">
                <span className="fun-overline">Team ritual</span>
                <strong>Count the good ones.</strong>
                <div className="fun-tally-marks" aria-hidden="true"><i /><i /><i /><i /><i /></div>
                <span className="fun-sample-label">Illustrative counter · no live total</span>
              </div>
            </div>
            <p className="fun-card-description">Track your post-game beers, one game at a time. Your personal beer counter is included on Free. For adult players; enjoy responsibly.</p>
            <div className="fun-reset-note"><RotateCcw size={13} aria-hidden="true" /> Beer Me progress resets January 1 each year.</div>
          </article>

          <article className="fun-card fun-trivia-card">
            <div className="fun-card-topline">
              <span className="fun-card-label"><CircleHelp size={16} aria-hidden="true" /> Daily hockey trivia</span>
              <span className="fun-free-tag">Free to play</span>
            </div>
            <div className="fun-trivia-layout">
              <div className="fun-trivia-patch">
                <img src="/badges/trivia/teams_franchises/tier-1.png" alt="Teams and Franchises trivia patch artwork preview" />
                <span>Lifetime progress</span>
              </div>
              <div className="fun-question">
                <span className="fun-overline">Sample question · not today's trivia</span>
                <h3>Which NHL trophy goes to the regular-season points leader?</h3>
                <div className="fun-options" role="group" aria-label="Illustrative sample trivia answers">
                  {triviaOptions.map((option) => {
                    const selected = answer === option;
                    const isCorrect = option === correctAnswer;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setAnswer(option)}
                        aria-pressed={selected}
                        className={`fun-option${selected ? " is-selected" : ""}${selected && isCorrect ? " is-correct" : ""}${selected && !isCorrect ? " is-incorrect" : ""}`}
                      >
                        <span>{option}</span>
                        {selected && isCorrect && <Check size={15} aria-label="Correct sample answer" />}
                      </button>
                    );
                  })}
                </div>
                {answer && (
                  <p className={`fun-answer ${answer === correctAnswer ? "is-right" : "is-wrong"}`} role="status">
                    {answer === correctAnswer ? "That’s it — the Art Ross Trophy." : "Not this one. The Art Ross Trophy goes to the points leader."}
                  </p>
                )}
              </div>
            </div>
            <p className="fun-trivia-footnote">Play daily for free. Correct answers build lifetime trivia patch progress on every plan; the full Trophy Case and artwork are for paid members age 21+.</p>
          </article>
        </div>
        <p className="fun-showcase-footnote">Patch tiers shown are illustrative. Hat Trick tiers are seasonal; trivia progress lasts a lifetime.</p>
      </div>
    </section>
  );
}
