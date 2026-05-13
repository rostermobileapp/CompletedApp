import { useEffect, useState, useRef, useCallback } from 'react';
import { Link, useLocation } from 'wouter';
import { motion, useInView, AnimatePresence } from 'framer-motion';
import {
  Trophy, ClipboardList, BarChart2, MessageSquare, CreditCard,
  Smartphone, Globe, Zap, Users, Menu, X, ArrowRight, Shield
} from 'lucide-react';
import rosterLightLogo from '@assets/Light_Mode_Logo_1768322748282.png';
import { useSeo } from '@/hooks/useSeo';

// ---------- helpers ----------
function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const listener = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, []);
  return reduced;
}

// ---------- Communication slideshow ----------
const COMM_SLIDES = [
  { src: '/messaging-comm-chat.png', alt: 'Team chat messaging' },
  { src: '/messaging-comm-wall.png', alt: 'League wall announcements' },
  { src: '/messaging-comm-events.png', alt: 'Team event RSVP' },
  { src: '/messaging-comm-push.png', alt: 'Push notification reminder' },
];

function CommSlideshow({ isActive }: { isActive: boolean }) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const reduced = typeof window !== 'undefined'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;

  const advance = useCallback(() => {
    setDirection(1);
    setIndex((i) => (i + 1) % COMM_SLIDES.length);
  }, []);

  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(advance, 2000);
    return () => clearInterval(id);
  }, [isActive, advance]);

  // Reset to first slide when this section becomes inactive
  useEffect(() => {
    if (!isActive) {
      setIndex(0);
      setDirection(1);
    }
  }, [isActive]);

  const variants = {
    enter: (d: number) => ({ x: d > 0 ? '100%' : '-100%', opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: d > 0 ? '-100%' : '100%', opacity: 0 }),
  };

  return (
    <div className="relative w-full h-full overflow-hidden">
      <AnimatePresence initial={false} custom={direction} mode="popLayout">
        <motion.img
          key={index}
          src={COMM_SLIDES[index].src}
          alt={COMM_SLIDES[index].alt}
          custom={direction}
          variants={reduced ? undefined : variants}
          initial={reduced ? false : 'enter'}
          animate="center"
          exit={reduced ? undefined : 'exit'}
          transition={{ type: 'spring', stiffness: 300, damping: 32, mass: 0.8 }}
          className="absolute inset-0 w-full h-full object-cover object-top"
        />
      </AnimatePresence>
      {/* Dot indicators */}
      <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 z-10">
        {COMM_SLIDES.map((_, i) => (
          <div
            key={i}
            className="rounded-full transition-all duration-300"
            style={{
              width: i === index ? 20 : 6,
              height: 6,
              background: i === index ? '#3c82f4' : 'rgba(255,255,255,0.5)',
            }}
          />
        ))}
      </div>
    </div>
  );
}

function FadeUp({
  children,
  delay = 0,
  className = '',
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const reduced = useReducedMotion();
  return (
    <motion.div
      ref={ref}
      initial={reduced ? false : { opacity: 0, y: 24 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, ease: 'easeOut', delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ---------- Animated bracket (app-style card layout) ----------
const B_CW = 134; // card width px
const B_CH = 94;  // card height px
const B_COL_GAP = 48; // horizontal gap between columns (for connector lines)

function BracketCard({
  x, y, label, round, team1, team2, winner,
}: {
  x: number; y: number; label: string; round: string;
  team1: string; team2: string; winner: string | null;
}) {
  const t1Win = !!winner && winner === team1 && team1 !== '';
  const t2Win = !!winner && winner === team2 && team2 !== '';
  const isWon = t1Win || t2Win;

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: B_CW,
        height: B_CH,
        borderRadius: 10,
        border: `2px solid ${isWon ? '#22c55e' : '#e5e7eb'}`,
        boxShadow: isWon
          ? '0 0 0 3px rgba(34,197,94,0.15), 0 0 18px rgba(34,197,94,0.4)'
          : '0 1px 4px rgba(0,0,0,0.06)',
        background: '#ffffff',
        padding: '7px 8px',
        boxSizing: 'border-box' as const,
        transition: 'border-color 0.5s ease, box-shadow 0.5s ease',
        fontFamily: 'Inter, ui-sans-serif, sans-serif',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 9.5, fontWeight: 700, color: '#111827', lineHeight: 1.1 }}>{label}</div>
          <div style={{ fontSize: 8, color: '#9ca3af', lineHeight: 1.3 }}>{round}</div>
        </div>
        {isWon && (
          <span style={{
            fontSize: 7, fontWeight: 800, color: '#16a34a', background: '#f0fdf4',
            borderRadius: 4, padding: '1px 5px', letterSpacing: '0.06em',
          }}>WIN</span>
        )}
      </div>
      {/* Team 1 pill */}
      <div style={{
        borderRadius: 20, padding: '3.5px 8px', fontSize: 9.5,
        fontWeight: t1Win ? 700 : 500,
        color: t1Win ? '#15803d' : (team1 ? '#374151' : '#d1d5db'),
        background: t1Win ? '#dcfce7' : '#f3f4f6',
        marginBottom: 3,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        fontStyle: team1 ? 'normal' : 'italic',
        transition: 'background 0.45s ease, color 0.45s ease',
      }}>
        {team1 || 'TBD'}
      </div>
      {/* vs */}
      <div style={{ fontSize: 8, color: '#9ca3af', textAlign: 'center', lineHeight: 1, marginBottom: 3 }}>vs</div>
      {/* Team 2 pill */}
      <div style={{
        borderRadius: 20, padding: '3.5px 8px', fontSize: 9.5,
        fontWeight: t2Win ? 700 : 500,
        color: t2Win ? '#15803d' : (team2 ? '#374151' : '#d1d5db'),
        background: t2Win ? '#dcfce7' : '#f3f4f6',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        fontStyle: team2 ? 'normal' : 'italic',
        transition: 'background 0.45s ease, color 0.45s ease',
      }}>
        {team2 || 'TBD'}
      </div>
    </div>
  );
}

function AnimatedBracket() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-200px' });
  const reduced = useReducedMotion();
  // stage -1 = not started, 0–6 = sequence steps
  const [stage, setStage] = useState(-1);

  useEffect(() => {
    if (!inView) return;
    if (reduced) { setStage(6); return; }
    const delays = [800, 1700, 2600, 3500, 4600, 5700, 6900];
    const timers = delays.map((d, i) => setTimeout(() => setStage(i), d));
    return () => timers.forEach(clearTimeout);
  }, [inView, reduced]);

  const CW = B_CW;
  const CH = B_CH;
  const GAP = B_COL_GAP;
  const PAIR_GAP = 10;   // gap between cards in the same QF pair
  const GROUP_SEP = 46;  // extra gap between the two QF pairs

  // QF top-y positions
  const qY = [
    0,
    CH + PAIR_GAP,
    CH * 2 + PAIR_GAP + GROUP_SEP,
    CH * 3 + PAIR_GAP * 2 + GROUP_SEP,
  ];

  // Center-y of each QF card
  const qCY = qY.map(y => y + CH / 2);

  // SF: centered between each paired QF
  const sCY = [(qCY[0] + qCY[1]) / 2, (qCY[2] + qCY[3]) / 2];
  const sY  = sCY.map(cy => Math.round(cy - CH / 2));

  // Final: centered between the two SF cards
  const fCY = (sCY[0] + sCY[1]) / 2;
  const fY  = Math.round(fCY - CH / 2);

  // Column x positions
  const col  = [0, CW + GAP, (CW + GAP) * 2];
  // X midpoint of each connector gap (where the vertical trunk sits)
  const midX = [col[0] + CW + Math.round(GAP / 2), col[1] + CW + Math.round(GAP / 2)];

  const totalW = col[2] + CW;
  const totalH = qY[3] + CH + 26; // extra room for champion label

  // Each connector: [SVG path d, stage threshold to trigger animation]
  // Path format: winner exits card-right → horizontal to midX → vertical to next-round centerY → horizontal to next-card-left
  const connectors: Array<[string, number]> = [
    [`M ${col[0] + CW} ${qCY[0]} H ${midX[0]} V ${sCY[0]} H ${col[1]}`, 0], // QF0 winner → SF0
    [`M ${col[0] + CW} ${qCY[1]} H ${midX[0]} V ${sCY[0]} H ${col[1]}`, 1], // QF1 winner → SF0
    [`M ${col[0] + CW} ${qCY[2]} H ${midX[0]} V ${sCY[1]} H ${col[1]}`, 2], // QF2 winner → SF1
    [`M ${col[0] + CW} ${qCY[3]} H ${midX[0]} V ${sCY[1]} H ${col[1]}`, 3], // QF3 winner → SF1
    [`M ${col[1] + CW} ${sCY[0]} H ${midX[1]} V ${fCY} H ${col[2]}`, 4],    // SF0 winner → Final
    [`M ${col[1] + CW} ${sCY[1]} H ${midX[1]} V ${fCY} H ${col[2]}`, 5],    // SF1 winner → Final
  ];

  const qfData = [
    { label: 'Game 1', round: 'Quarterfinals', t1: 'Ice Dogs',   t2: 'Pucks',      w: 'Ice Dogs',   ws: 0 },
    { label: 'Game 2', round: 'Quarterfinals', t1: 'Frostbites', t2: 'Slapshots',  w: 'Slapshots',  ws: 1 },
    { label: 'Game 3', round: 'Quarterfinals', t1: 'Bardowns',   t2: 'Hat Tricks', w: 'Hat Tricks', ws: 2 },
    { label: 'Game 4', round: 'Quarterfinals', t1: 'Five Hole',  t2: 'Top Shelf',  w: 'Top Shelf',  ws: 3 },
  ];

  return (
    <div ref={ref} style={{ overflowX: 'auto' }}>
      <div style={{ position: 'relative', width: totalW, height: totalH, margin: '0 auto' }}>

        {/* ── SVG connector layer ── */}
        <svg
          style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}
          width={totalW}
          height={totalH}
        >
          {connectors.map(([d, trig], i) => (
            <motion.path
              key={i}
              d={d}
              fill="none"
              stroke="#3c82f4"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={reduced ? false : { pathLength: 0, opacity: 0 }}
              animate={stage >= trig ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
              transition={{ duration: 0.55, ease: 'easeInOut' }}
            />
          ))}
          {/* Arrow tips at the entry of each next-round card */}
          {[
            { x: col[1], y: sCY[0], trig: 1 },  // → SF0 (after both QF0+QF1 done)
            { x: col[1], y: sCY[1], trig: 3 },  // → SF1
            { x: col[2], y: fCY,    trig: 5 },  // → Final
          ].map(({ x, y, trig }, i) => (
            <motion.polygon
              key={`arr-${i}`}
              points={`${x},${y - 4} ${x + 7},${y} ${x},${y + 4}`}
              fill="#3c82f4"
              initial={{ opacity: 0 }}
              animate={{ opacity: stage >= trig ? 1 : 0 }}
              transition={{ duration: 0.25, delay: 0.45 }}
            />
          ))}
        </svg>

        {/* ── QF Cards ── */}
        {qfData.map((g, i) => (
          <BracketCard
            key={g.label}
            x={col[0]} y={qY[i]}
            label={g.label} round={g.round}
            team1={g.t1} team2={g.t2}
            winner={stage >= g.ws ? g.w : null}
          />
        ))}

        {/* ── SF Cards ── */}
        <BracketCard
          x={col[1]} y={sY[0]}
          label="Game 5" round="Semifinals"
          team1={stage >= 0 ? 'Ice Dogs'  : ''}
          team2={stage >= 1 ? 'Slapshots' : ''}
          winner={stage >= 4 ? 'Ice Dogs' : null}
        />
        <BracketCard
          x={col[1]} y={sY[1]}
          label="Game 6" round="Semifinals"
          team1={stage >= 2 ? 'Hat Tricks' : ''}
          team2={stage >= 3 ? 'Top Shelf'  : ''}
          winner={stage >= 5 ? 'Hat Tricks' : null}
        />

        {/* ── Final Card ── */}
        <BracketCard
          x={col[2]} y={fY}
          label="Final" round="Championship"
          team1={stage >= 4 ? 'Ice Dogs'   : ''}
          team2={stage >= 5 ? 'Hat Tricks' : ''}
          winner={stage >= 6 ? 'Ice Dogs'  : null}
        />

        {/* ── Champion label ── */}
        <AnimatePresence>
          {stage >= 6 && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.3 }}
              style={{
                position: 'absolute',
                left: col[2],
                top: fY + CH + 6,
                width: CW,
                textAlign: 'center',
                fontSize: 10,
                fontWeight: 700,
                color: '#3c82f4',
                fontFamily: 'Inter, ui-sans-serif, sans-serif',
              }}
            >
              🏒 Champions
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ---------- Sticky scroll section ----------
const LEAGUE_CALLOUTS = [
  {
    id: 'standings',
    eyebrow: '01 — Standings',
    headline: 'Real-time standings.',
    body: 'Score the game in the app and standings update instantly. Players check the table from the parking lot. No waiting for someone to manually enter results on Sunday night.',
    icon: BarChart2,
  },
  {
    id: 'scorekeeping',
    eyebrow: '02 — Scorekeeping',
    headline: 'Live in-game scorekeeping.',
    body: 'Goals, assists, penalties, saves — all tracked as the game happens. Stats update for every player on every team, automatically. Your league finally has season-long leaderboards that actually mean something.',
    icon: ClipboardList,
  },
  {
    id: 'messaging',
    eyebrow: '03 — Communication',
    headline: 'All communication, one place.',
    body: 'Schedules, lineups, payments, announcements, captain chats — all inside Roster. Your players already check the app for their next game. Why would you message them somewhere else?',
    icon: MessageSquare,
  },
  {
    id: 'registration',
    eyebrow: '04 — Registration',
    headline: 'Registration, payments, waivers.',
    body: 'Players sign up, pay their league dues, and sign the waiver in one flow. You see who\'s in, who\'s paid, and who\'s still on the fence — without a spreadsheet in sight.',
    icon: CreditCard,
  },
];

function StickyLeagueSection() {
  const [active, setActive] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const headings = sectionRef.current?.querySelectorAll('[data-heading]');
    if (!headings?.length) return;

    // Observe the h3 headings directly — they're small elements so the trigger
    // fires precisely when the heading text crosses the phone-centre band.
    // Phone is sticky at top-32 (~128px) with ~550px height → centre ≈ 50% vp.
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setActive(Number((e.target as HTMLElement).dataset.heading ?? '0'));
          }
        });
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 }
    );

    headings.forEach((h) => obs.observe(h));
    return () => obs.disconnect();
  }, []);

  const ActiveIcon = LEAGUE_CALLOUTS[active].icon;

  return (
    <div ref={containerRef} className="relative">
      {/* Desktop: two-column sticky */}
      <div className="hidden lg:grid lg:grid-cols-2 lg:gap-16 lg:items-start">
        {/* Sticky phone mockup */}
        <div className="sticky top-32 self-start">
          {/* iPhone 16 mockup */}
          <div ref={phoneRef} className="relative mx-auto" style={{ width: 260 }}>
            {/* Left side buttons: action + vol up + vol down */}
            <div className="absolute" style={{ left: -3, top: 96,  width: 3, height: 28, background: '#3a3a3c', borderRadius: '3px 0 0 3px' }} />
            <div className="absolute" style={{ left: -3, top: 144, width: 3, height: 44, background: '#3a3a3c', borderRadius: '3px 0 0 3px' }} />
            <div className="absolute" style={{ left: -3, top: 200, width: 3, height: 44, background: '#3a3a3c', borderRadius: '3px 0 0 3px' }} />
            {/* Right side buttons: power + camera control */}
            <div className="absolute" style={{ right: -3, top: 156, width: 3, height: 64, background: '#3a3a3c', borderRadius: '0 3px 3px 0' }} />
            <div className="absolute" style={{ right: -3, top: 264, width: 3, height: 40, background: '#3a3a3c', borderRadius: '0 3px 3px 0' }} />

            {/* Titanium frame + screen */}
            <div style={{
              background: 'linear-gradient(160deg, #2c2c2e 0%, #1c1c1e 50%, #2c2c2e 100%)',
              borderRadius: 52,
              padding: 3,
              boxShadow: '0 0 0 0.5px #555, inset 0 0 0 0.5px #444, 0 32px 64px -16px rgba(0,0,0,0.85), 0 8px 24px -4px rgba(0,0,0,0.5)',
            }}>
              {/* Screen */}
              <div style={{ background: '#000', borderRadius: 50, overflow: 'hidden', aspectRatio: '9/19.5', position: 'relative' }}>
                {/* Dynamic Island */}
                <div style={{
                  position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
                  width: 88, height: 28, background: '#000', borderRadius: 20,
                  border: '1px solid #1a1a1a', boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.9)', zIndex: 10,
                }} />

                {/* Content */}
                <div className="w-full h-full flex flex-col items-center justify-center">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={active}
                      initial={reduced ? false : { opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={reduced ? undefined : { opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.3 }}
                      className="w-full h-full overflow-hidden"
                    >
                      {active === 0 ? (
                        <img src="/standings-preview.png" alt="League Standings" className="w-full h-full object-cover object-top" />
                      ) : active === 1 ? (
                        <img src="/scorekeeper-preview.png" alt="Live Scorekeeping" className="w-full h-full object-cover object-top" />
                      ) : active === 2 ? (
                        <CommSlideshow isActive={active === 2} />
                      ) : active === 3 ? (
                        <img src="/payments-preview.png" alt="Registration & Payments" className="w-full h-full object-cover object-top" />
                      ) : (
                        <div className="w-full h-full p-5 pt-12 bg-blue-50 flex flex-col gap-3 items-center justify-center text-center">
                          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-white shadow-sm">
                            <ActiveIcon className="w-6 h-6 text-[#3c82f4]" />
                          </div>
                          <p className="text-xs font-semibold text-gray-700">{LEAGUE_CALLOUTS[active].eyebrow}</p>
                          <p className="text-xs text-gray-500 leading-relaxed">{LEAGUE_CALLOUTS[active].headline}</p>
                          <div className="flex gap-1 mt-1">
                            {LEAGUE_CALLOUTS.map((_, i) => (
                              <div key={i} className={`h-1 rounded-full transition-all duration-300 ${i === active ? 'w-6 bg-[#3c82f4]' : 'w-1.5 bg-gray-300'}`} />
                            ))}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Scrolling callouts */}
        <div ref={sectionRef} className="space-y-32 py-8">
          {LEAGUE_CALLOUTS.map((c, i) => {
            const Icon = c.icon;
            return (
              <div key={c.id} data-callout={i} className="min-h-[40vh] flex flex-col justify-center">
                <FadeUp>
                  <p className="text-xs font-bold tracking-widest text-gray-400 uppercase mb-3">{c.eyebrow}</p>
                  <h3 data-heading={i} className="text-3xl font-bold text-gray-900 mb-4">{c.headline}</h3>
                  <p className="text-lg text-gray-500 leading-relaxed max-w-md">{c.body}</p>
                </FadeUp>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile: phone mockup + text for each feature */}
      <div className="lg:hidden space-y-16">
        {LEAGUE_CALLOUTS.map((c, i) => (
          <FadeUp key={c.id} delay={i * 0.08}>
            <div className="flex flex-col items-center gap-6">
              {/* Mini phone mockup */}
              <div className="relative mx-auto" style={{ width: 190 }}>
                {/* Side buttons */}
                <div className="absolute" style={{ left: -2.5, top: 70, width: 2.5, height: 20, background: '#3a3a3c', borderRadius: '2px 0 0 2px' }} />
                <div className="absolute" style={{ left: -2.5, top: 102, width: 2.5, height: 32, background: '#3a3a3c', borderRadius: '2px 0 0 2px' }} />
                <div className="absolute" style={{ left: -2.5, top: 146, width: 2.5, height: 32, background: '#3a3a3c', borderRadius: '2px 0 0 2px' }} />
                <div className="absolute" style={{ right: -2.5, top: 114, width: 2.5, height: 48, background: '#3a3a3c', borderRadius: '0 2px 2px 0' }} />
                {/* Frame */}
                <div style={{
                  background: 'linear-gradient(160deg, #2c2c2e 0%, #1c1c1e 50%, #2c2c2e 100%)',
                  borderRadius: 38,
                  padding: 2.5,
                  boxShadow: '0 0 0 0.5px #555, inset 0 0 0 0.5px #444, 0 24px 48px -12px rgba(0,0,0,0.75), 0 6px 18px -4px rgba(0,0,0,0.4)',
                }}>
                  <div style={{ background: '#000', borderRadius: 36, overflow: 'hidden', aspectRatio: '9/19.5', position: 'relative' }}>
                    {/* Dynamic Island */}
                    <div style={{ position: 'absolute', top: 9, left: '50%', transform: 'translateX(-50%)', width: 64, height: 20, background: '#000', borderRadius: 14, border: '1px solid #1a1a1a', zIndex: 10 }} />
                    {/* Screen content */}
                    <div className="w-full h-full">
                      {i === 0 ? (
                        <img src="/standings-preview.png" alt="League Standings" className="w-full h-full object-cover object-top" />
                      ) : i === 1 ? (
                        <img src="/scorekeeper-preview.png" alt="Live Scorekeeping" className="w-full h-full object-cover object-top" />
                      ) : i === 2 ? (
                        <CommSlideshow isActive={true} />
                      ) : (
                        <img src="/payments-preview.png" alt="Registration & Payments" className="w-full h-full object-cover object-top" />
                      )}
                    </div>
                  </div>
                </div>
              </div>
              {/* Text */}
              <div className="text-center px-4">
                <p className="text-xs font-bold tracking-widest text-gray-400 uppercase mb-2">{c.eyebrow}</p>
                <h3 className="text-2xl font-bold text-gray-900 mb-3">{c.headline}</h3>
                <p className="text-gray-500 leading-relaxed max-w-xs mx-auto">{c.body}</p>
              </div>
            </div>
          </FadeUp>
        ))}
      </div>
    </div>
  );
}

// ---------- Animated counter ----------
function CountUp({ target, suffix = '' }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!inView || reduced) {
      setCount(target);
      return;
    }
    let start = 0;
    const duration = 1200;
    const step = 16;
    const increment = target / (duration / step);
    const timer = setInterval(() => {
      start += increment;
      if (start >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, step);
    return () => clearInterval(timer);
  }, [inView, target, reduced]);

  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>;
}

// ---------- Quick-hit grid ----------
const GRID_FEATURES = [
  {
    icon: Users,
    headline: 'One app, every role',
    body: 'Captain, player, commissioner, ref — same app, different view. Nobody downloads three things.',
  },
  {
    icon: Trophy,
    headline: 'Speaks hockey',
    body: 'Sin bin, sheet, barn, beer league. The language fits.',
  },
  {
    icon: Smartphone,
    headline: 'iOS, Android, Web',
    body: 'Real native apps. Real web dashboard. Everything in sync.',
  },
  {
    icon: Zap,
    headline: 'Stats that actually update',
    body: 'Goals scored at 9pm show up in the leaderboard at 9:01.',
  },
  {
    icon: Shield,
    headline: 'Built for adults',
    body: 'No parent permissions, no jersey-number drama. Designed for adult rec hockey.',
  },
  {
    icon: MessageSquare,
    headline: 'Real human support',
    body: 'You can email the founder. Often you\'ll get a reply that night.',
  },
];

// ---------- Main page ----------
export default function FeaturesLanding() {
  const [, setLocation] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useSeo({
    title: 'Roster — Features Built for Hockey Leagues',
    description: 'Built by a beer league captain. Roster is the all-in-one league management platform for adult recreational hockey — tournaments, scorekeeping, standings, and registration in one app.',
    ogTitle: 'Roster — Features Built for Hockey Leagues',
    ogDescription: 'Built by a beer league captain. Roster is the all-in-one league management platform for adult recreational hockey.',
  });

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Sticky header */}
      <header className="fixed top-0 left-0 right-0 z-[70] bg-white/90 backdrop-blur-xl border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-0 flex items-center md:grid md:grid-cols-3">
          {/* Desktop nav — col 1 */}
          <nav className="hidden md:flex items-center gap-1 text-sm whitespace-nowrap">
            <Link href="/" className="px-3 py-2 rounded-lg text-gray-500 hover:text-[#3c82f4] hover:bg-[#3c82f4]/8 transition-colors font-medium">Home</Link>
            <Link href="/features" className="px-3 py-2 rounded-lg text-[#3c82f4] bg-[#3c82f4]/8 font-semibold">Features</Link>
            <Link href="/pricing" className="px-3 py-2 rounded-lg text-gray-500 hover:text-[#3c82f4] hover:bg-[#3c82f4]/8 transition-colors font-medium">Pricing</Link>
            <Link href="/about" className="px-3 py-2 rounded-lg text-gray-500 hover:text-[#3c82f4] hover:bg-[#3c82f4]/8 transition-colors font-medium">About</Link>
            <Link href="/referral-program" className="px-3 py-2 rounded-lg text-gray-500 hover:text-[#3c82f4] hover:bg-[#3c82f4]/8 transition-colors font-medium">Partners</Link>
          </nav>
          {/* Logo — left on mobile, centered col on desktop */}
          <div className="flex-none md:flex md:justify-center">
            <img src={rosterLightLogo} alt="Roster" className="h-10 object-contain" />
          </div>
          {/* Mobile: Join Waitlist centered between logo and hamburger */}
          <div className="flex-1 flex justify-center md:hidden px-2">
            <button
              onClick={() => setLocation('/waitlist')}
              className="px-4 py-2 rounded-full bg-[#3c82f4] text-white hover:bg-[#3c82f4]/90 transition-colors font-semibold text-sm"
            >
              Join Waitlist
            </button>
          </div>
          {/* Right col — desktop: badge + Join Waitlist; mobile: hamburger only */}
          <div className="flex-none flex items-center gap-3 justify-end">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-[#3c82f4] bg-[#3c82f4]/8 border border-[#3c82f4]/20 rounded-full px-3 py-1 whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3c82f4] animate-pulse" />
              June 1st Launch
            </span>
            <button
              onClick={() => setLocation('/waitlist')}
              className="hidden md:inline-flex px-4 py-2 rounded-full bg-[#3c82f4] text-white hover:bg-[#3c82f4]/90 transition-colors font-semibold text-sm"
            >
              Join Waitlist
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-gray-600 hover:text-gray-900"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-200 bg-white">
            <div className="px-6 py-4 space-y-3">
              <Link href="/" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-gray-600 hover:text-gray-900">Home</Link>
              <Link href="/features" onClick={() => setMobileMenuOpen(false)} className="block text-sm font-semibold text-gray-900">Features</Link>
              <Link href="/pricing" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-gray-600 hover:text-gray-900">Pricing</Link>
              <Link href="/about" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-gray-600 hover:text-gray-900">About</Link>
              <Link href="/referral-program" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-gray-600 hover:text-gray-900">Partners</Link>
            </div>
          </div>
        )}
      </header>

      {/* ── TOURNAMENTS ──────────────────────────────────────── */}
      <section className="pt-0 pb-24 px-6 bg-gray-50">
        {/* Sticky section label */}
        <div className="sticky top-[40px] z-[25] -mx-6 py-1 mb-20" style={{ backgroundColor: '#3c82f4' }}>
          <p className="text-xl font-bold text-gray-900 uppercase text-center" style={{ letterSpacing: '0.2em' }}>Tournaments</p>
        </div>
        <div className="max-w-6xl mx-auto">
          <FadeUp>
            <h2
              className="font-bold text-gray-900 text-center mb-4"
              style={{ fontSize: 'clamp(2.5rem, 5vw, 4.5rem)' }}
            >
              Run a tournament that doesn't take a month to set up.
            </h2>
            <p className="text-center text-gray-500 text-lg max-w-2xl mx-auto mb-16">
              From bracket to champion — automated, tracked, and updated in real time.
            </p>
          </FadeUp>

          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-16 items-center">
            {/* Left: features — shrinks to fit, bracket never shrinks */}
            <div className="space-y-10 min-w-0">
              {[
                {
                  icon: Trophy,
                  title: 'Smart Bracket Creator',
                  body: 'Drop in your teams, pick your format, and Roster builds the bracket in seconds. Single elim, double elim, round robin into playoffs — it knows what you\'re trying to do.',
                },
                {
                  icon: Zap,
                  title: 'Brackets that advance themselves',
                  body: 'Score a game, the winner moves on. No commissioner sitting in the rink office updating a bracket on a clipboard. The next matchup is already on the schedule before the zamboni hits the ice.',
                },
                {
                  icon: CreditCard,
                  title: 'Running a solo tournament?',
                  body: 'Running a one-off tournament? Use Roster for just that weekend at $10/team. Every player gets full paid access for the whole tournament.',
                },
              ].map((item, i) => {
                const Icon = item.icon;
                return (
                  <FadeUp key={item.title} delay={i * 0.1}>
                    <div className="flex gap-5">
                      <div className="w-12 h-12 rounded-xl bg-[#3c82f4]/10 border border-[#3c82f4]/20 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-6 h-6 text-[#3c82f4]" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-gray-900 mb-1">{item.title}</h3>
                        <p className="text-gray-500 leading-relaxed">{item.body}</p>
                      </div>
                    </div>
                  </FadeUp>
                );
              })}
            </div>

            {/* Right: animated bracket */}
            <FadeUp delay={0.2}>
              <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-8">
                <p className="text-xs font-bold tracking-widest text-gray-400 uppercase mb-6 text-center">Live bracket — filling in as games finish</p>
                <AnimatedBracket />
                <p className="text-center text-xs text-gray-400 mt-4">Bracket advances automatically after each score</p>
              </div>
            </FadeUp>
          </div>
        </div>
      </section>

      {/* ── DRAFT NIGHT ──────────────────────────────────────── */}
      <section className="pt-0 pb-24 px-6 bg-gray-50">
        {/* Sticky section label */}
        <div className="sticky top-[40px] z-[25] -mx-6 py-1 mb-8" style={{ backgroundColor: '#3c82f4' }}>
          <p className="text-xl font-bold text-gray-900 uppercase text-center" style={{ letterSpacing: '0.2em' }}>Draft Night</p>
        </div>
        <div className="max-w-6xl mx-auto">
          {/* Heading — centered above the 3-col layout */}
          <FadeUp>
            <p className="text-xs font-bold tracking-widest text-[#3c82f4] uppercase mb-4 text-center">Exclusive to Roster</p>
            <h2
              className="font-bold text-gray-900 text-center mb-4"
              style={{ fontSize: 'clamp(2rem, 4vw, 3.5rem)' }}
            >
              No other app has this.
              <br />
              <span className="text-gray-400">Not one.</span>
            </h2>
            <p className="text-gray-500 text-lg leading-relaxed text-center max-w-2xl mx-auto mb-16">
              If you want draft night to feel like an event — a real moment your players actually look forward to — Roster is the only way to do it.
            </p>
          </FadeUp>

          {/* 3-col: left cards | phone | right cards */}
          <div className="hidden md:grid md:grid-cols-[200px_auto_200px] gap-6 items-center">

            {/* Left cards */}
            <div className="flex flex-col gap-4">
              {[
                {
                  title: 'Captain READY lobby',
                  body: 'Captains get notified, join the lobby, and hit READY. The commissioner starts the clock when everyone\'s in.',
                },
                {
                  title: 'Live pick clock',
                  body: 'Each captain gets their time on the clock. Run out? 30-second extension, then an auto-pick. No one holds up the room.',
                },
              ].map((item, i) => (
                <FadeUp key={item.title} delay={i * 0.08}>
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 aspect-square flex flex-col justify-between">
                    <div className="w-2 h-2 rounded-full bg-[#3c82f4]" />
                    <div>
                      <h3 className="text-gray-900 font-bold text-sm mb-2">{item.title}</h3>
                      <p className="text-gray-500 text-xs leading-relaxed">{item.body}</p>
                    </div>
                  </div>
                </FadeUp>
              ))}
            </div>

            {/* Center: phone mockup */}
            <FadeUp delay={0.1}>
              <div className="flex justify-center">
                <div className="relative" style={{ width: 240 }}>
                  <div className="absolute inset-0 rounded-[3rem] bg-[#3c82f4]/15 blur-2xl scale-110" />
                  <div className="relative bg-gray-900 rounded-[3rem] p-3 shadow-2xl border border-gray-200">
                    <div className="absolute top-3 left-1/2 -translate-x-1/2 w-20 h-6 bg-gray-900 rounded-full z-10 flex items-center justify-center">
                      <div className="w-10 h-2.5 bg-gray-800 rounded-full" />
                    </div>
                    <div className="bg-black rounded-[2.4rem] overflow-hidden" style={{ aspectRatio: '9/19.5' }}>
                      <video
                        src="/draft-demo.mp4"
                        autoPlay
                        loop
                        muted
                        playsInline
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </FadeUp>

            {/* Right cards */}
            <div className="flex flex-col gap-4">
              {[
                {
                  title: 'Buddy system',
                  body: 'Want to stay on the same line as your D-partner? Set up buddy groups so the algorithm can try to keep you together.',
                },
                {
                  title: 'Goalies first',
                  body: 'Draft goalies in a separate round before the skaters. Because finding a goalie last-minute is a whole thing.',
                },
              ].map((item, i) => (
                <FadeUp key={item.title} delay={i * 0.08 + 0.16}>
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 aspect-square flex flex-col justify-between">
                    <div className="w-2 h-2 rounded-full bg-[#3c82f4]" />
                    <div>
                      <h3 className="text-gray-900 font-bold text-sm mb-2">{item.title}</h3>
                      <p className="text-gray-500 text-xs leading-relaxed">{item.body}</p>
                    </div>
                  </div>
                </FadeUp>
              ))}
            </div>

          </div>

          {/* Mobile fallback: phone + cards stacked */}
          <div className="md:hidden flex flex-col items-center gap-8">
            <div className="relative" style={{ width: 240 }}>
              <div className="absolute inset-0 rounded-[3rem] bg-[#3c82f4]/15 blur-2xl scale-110" />
              <div className="relative bg-gray-900 rounded-[3rem] p-3 shadow-2xl border border-gray-200">
                <div className="absolute top-3 left-1/2 -translate-x-1/2 w-20 h-6 bg-gray-900 rounded-full z-10 flex items-center justify-center">
                  <div className="w-10 h-2.5 bg-gray-800 rounded-full" />
                </div>
                <div className="bg-black rounded-[2.4rem] overflow-hidden" style={{ aspectRatio: '9/19.5' }}>
                  <video src="/draft-demo.mp4" autoPlay loop muted playsInline className="w-full h-full object-cover" />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 w-full">
              {[
                { title: 'Captain READY lobby', body: 'Captains join the lobby and hit READY. The commissioner starts when everyone\'s in.' },
                { title: 'Live pick clock', body: '30-second extension on expiry, then auto-pick. No one holds up the room.' },
                { title: 'Buddy system', body: 'Set up buddy groups so the algorithm keeps linemates together.' },
                { title: 'Goalies first', body: 'Draft goalies in a separate round before skaters.' },
              ].map((item) => (
                <div key={item.title} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 flex flex-col gap-3">
                  <div className="w-2 h-2 rounded-full bg-[#3c82f4]" />
                  <div>
                    <h3 className="text-gray-900 font-bold text-sm mb-1">{item.title}</h3>
                    <p className="text-gray-500 text-xs leading-relaxed">{item.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </section>

      {/* ── LEAGUE MANAGEMENT ────────────────────────────────── */}
      <section className="pt-0 pb-24 px-6 bg-white">
        {/* Sticky section label */}
        <div className="sticky top-[40px] z-[25] -mx-6 py-1 mb-8" style={{ backgroundColor: '#3c82f4' }}>
          <p className="text-xl font-bold text-gray-900 uppercase text-center" style={{ letterSpacing: '0.2em' }}>League Management</p>
        </div>
        <div className="max-w-6xl mx-auto">
          <FadeUp>
            <h2
              className="font-bold text-gray-900 text-center mb-4"
              style={{ fontSize: 'clamp(2rem, 4vw, 3.5rem)' }}
            >
              Everything happens in the app.
              <br />
              <span className="text-gray-400">Not in your text messages.</span>
            </h2>
            <p className="text-center text-gray-500 text-lg max-w-2xl mx-auto mb-16">
              Four features that replace four different tools — all in one place.
            </p>
          </FadeUp>
          <StickyLeagueSection />
        </div>
      </section>

      {/* ── STATS / TRUST BAND ───────────────────────────────── */}
      <section className="py-20 px-6 bg-[#3c82f4]">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 text-center">
            <FadeUp>
              <div className="text-4xl md:text-5xl font-black text-white mb-2">Built Local</div>
              <div className="text-blue-200 text-sm font-medium">No private equity money. Just the product of a Colorado born player.</div>
            </FadeUp>
            <FadeUp delay={0.1}>
              <div className="text-4xl md:text-5xl font-black text-white mb-2">Hockey Only</div>
              <div className="text-blue-200 text-sm font-medium">Jack-of-all-trades is a master of none.</div>
            </FadeUp>
            <FadeUp delay={0.2}>
              <div className="text-4xl md:text-5xl font-black text-white mb-2">Community</div>
              <div className="text-blue-200 text-sm font-medium">A portion of proceeds go back to grow the game.</div>
            </FadeUp>
          </div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <footer className="border-t border-gray-200 py-12 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-wrap justify-center gap-16 mb-10 text-sm">
            <div>
              <p className="font-semibold text-gray-900 mb-3">Product</p>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="/features" className="hover:text-gray-900 transition-colors font-medium text-[#3c82f4]">Features</Link></li>
                <li><Link href="/pricing" className="hover:text-gray-900 transition-colors">Pricing</Link></li>
                <li><Link href="/waitlist" className="hover:text-gray-900 transition-colors">Join Waitlist</Link></li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-3">Company</p>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="/about" className="hover:text-gray-900 transition-colors">About</Link></li>
                <li><Link href="/support" className="hover:text-gray-900 transition-colors">Support</Link></li>
                <li><Link href="/privacy-policy" className="hover:text-gray-900 transition-colors">Privacy Policy</Link></li>
                <li><Link href="/terms-of-service" className="hover:text-gray-900 transition-colors">Terms of Service</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-100 pt-6">
            <p className="text-sm text-gray-400 text-center flex items-center justify-center gap-2">
              &copy; 2025{' '}
              <img src={rosterLightLogo} alt="Roster" className="h-4 object-contain" />
              . Built for leagues, by a beer league captain. No ads. Ever.
            </p>
          </div>
        </div>
      </footer>

      <style>{`
        @keyframes features-float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="features-float"] { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
