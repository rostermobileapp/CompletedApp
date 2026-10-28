import { useEffect, useRef, useState } from "react";
import "./HeroSplitFlapWord.css";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const tileCount = 10;
const stepCadence = 104;
const flipDuration = 96;

type Transition = {
  from: string;
  to: string;
  startedAt: number;
};

function normalizeWord(word: string) {
  const centeredWord = word.toUpperCase().slice(0, tileCount);
  const leftPadding = Math.floor((tileCount - centeredWord.length) / 2);
  return centeredWord
    .padStart(centeredWord.length + leftPadding, " ")
    .padEnd(tileCount, " ");
}

function getLetterPath(from: string, to: string) {
  if (from === to) return [from];
  const fromIndex = alphabet.indexOf(from);
  const toIndex = alphabet.indexOf(to);
  if (fromIndex < 0 || toIndex < 0) return [from, to];

  const steps = (toIndex - fromIndex + alphabet.length) % alphabet.length;
  return Array.from(
    { length: steps + 1 },
    (_, index) => alphabet[(fromIndex + index) % alphabet.length],
  );
}

function HalfFace({ letter, half }: { letter: string; half: "top" | "bottom" }) {
  return (
    <span className={`rs-flap-face rs-flap-face-${half}`}>
      <span>{letter.trim() ? letter : "\u00a0"}</span>
    </span>
  );
}

function SplitFlapTile({
  from,
  to,
  elapsed,
}: {
  from: string;
  to: string;
  elapsed: number;
}) {
  const path = getLetterPath(from, to);
  const steps = path.length - 1;
  const stepIndex = steps ? Math.min(steps, Math.floor(elapsed / stepCadence)) : 0;
  const settledIndex = Math.min(stepIndex, steps);
  const settled = path[settledIndex] ?? to;
  const isFlipping = stepIndex < steps && elapsed >= stepIndex * stepCadence;
  const progress = isFlipping
    ? Math.min(1, Math.max(0, (elapsed - stepIndex * stepCadence) / flipDuration))
    : 0;
  const incoming = isFlipping ? path[stepIndex + 1] : settled;
  const upperProgress = Math.min(1, progress / 0.5);
  const lowerProgress = Math.min(1, Math.max(0, (progress - 0.5) / 0.5));
  const upperRotation = -90 * upperProgress;
  const lowerRotation = 90 * (1 - lowerProgress);

  return (
    <span className="rs-flap-tile" aria-hidden="true">
      <span className="rs-flap-static rs-flap-static-top">
        <HalfFace letter={incoming} half="top" />
      </span>
      <span className="rs-flap-static rs-flap-static-bottom">
        <HalfFace letter={settled} half="bottom" />
      </span>
      {isFlipping && (
        <>
        <span
          className="rs-flap-hinge"
          style={{ transform: `rotateX(${upperRotation}deg)` }}
        >
          <HalfFace letter={settled} half="top" />
        </span>
        <span
          className="rs-flap-lower-hinge"
          style={{ transform: `rotateX(${lowerRotation}deg)` }}
        >
          <HalfFace letter={incoming} half="bottom" />
        </span>
        </>
      )}
    </span>
  );
}

export default function HeroSplitFlapWord({ word }: { word: string }) {
  const normalizedWord = normalizeWord(word);
  const previousInput = useRef(normalizedWord);
  const stableWord = useRef(normalizedWord);
  const [transition, setTransition] = useState<Transition | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (normalizedWord === previousInput.current) return;
    previousInput.current = normalizedWord;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      stableWord.current = normalizedWord;
      setTransition(null);
      setElapsed(0);
      return;
    }

    setElapsed(0);
    setTransition({
      from: stableWord.current,
      to: normalizedWord,
      startedAt: performance.now(),
    });
  }, [normalizedWord]);

  useEffect(() => {
    if (!transition) return;
    const from = normalizeWord(transition.from);
    const to = normalizeWord(transition.to);
    const maxSteps = Math.max(
      ...Array.from({ length: tileCount }, (_, index) =>
        getLetterPath(from[index], to[index]).length - 1,
      ),
    );
    const duration = maxSteps ? (maxSteps - 1) * stepCadence + flipDuration : 0;
    let frame = 0;

    const tick = (now: number) => {
      const nextElapsed = Math.min(duration, now - transition.startedAt);
      setElapsed(nextElapsed);
      if (nextElapsed >= duration) {
        stableWord.current = transition.to;
        setTransition(null);
      } else {
        frame = window.requestAnimationFrame(tick);
      }
    };

    frame = window.requestAnimationFrame(tick);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [transition]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const settleOnPreferenceChange = () => {
      if (!media.matches) return;
      stableWord.current = normalizedWord;
      previousInput.current = normalizedWord;
      setTransition(null);
      setElapsed(0);
    };
    media.addEventListener("change", settleOnPreferenceChange);
    return () => media.removeEventListener("change", settleOnPreferenceChange);
  }, [normalizedWord]);

  const displayFrom = transition ? normalizeWord(transition.from) : normalizedWord;
  const displayTo = transition ? normalizeWord(transition.to) : normalizedWord;

  return (
    <span className="rs-split-flap-word" aria-hidden="true">
      {Array.from({ length: tileCount }, (_, index) => (
        <SplitFlapTile
          key={index}
          from={displayFrom[index]}
          to={displayTo[index]}
          elapsed={transition ? elapsed : 0}
        />
      ))}
    </span>
  );
}
