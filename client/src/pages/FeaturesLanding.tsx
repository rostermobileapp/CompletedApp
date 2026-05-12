import { useEffect, useState, useRef } from 'react';
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
  const inView = useInView(ref, { once: true, margin: '-60px' });
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
    color: 'bg-blue-50 border-blue-100',
    iconColor: 'text-[#3c82f4]',
  },
  {
    id: 'scorekeeping',
    eyebrow: '02 — Scorekeeping',
    headline: 'Live in-game scorekeeping.',
    body: 'Goals, assists, penalties, saves — all tracked as the game happens. Stats update for every player on every team, automatically. Your league finally has season-long leaderboards that actually mean something.',
    icon: ClipboardList,
    color: 'bg-green-50 border-green-100',
    iconColor: 'text-green-600',
  },
  {
    id: 'messaging',
    eyebrow: '03 — Communication',
    headline: 'All communication, one place.',
    body: 'Schedules, lineups, payments, announcements, captain chats — all inside Roster. Your players already check the app for their next game. Why would you message them somewhere else?',
    icon: MessageSquare,
    color: 'bg-purple-50 border-purple-100',
    iconColor: 'text-purple-600',
  },
  {
    id: 'registration',
    eyebrow: '04 — Registration',
    headline: 'Registration, payments, waivers.',
    body: 'Players sign up, pay their league dues, and sign the waiver in one flow. You see who\'s in, who\'s paid, and who\'s still on the fence — without a spreadsheet in sight.',
    icon: CreditCard,
    color: 'bg-orange-50 border-orange-100',
    iconColor: 'text-orange-500',
  },
];

function StickyLeagueSection() {
  const [active, setActive] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const sections = sectionRef.current?.querySelectorAll('[data-callout]');
    if (!sections) return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            const idx = Number((e.target as HTMLElement).dataset.callout);
            setActive(idx);
          }
        });
      },
      { rootMargin: '-40% 0px -40% 0px', threshold: 0 }
    );
    sections.forEach(s => obs.observe(s));
    return () => obs.disconnect();
  }, []);

  const ActiveIcon = LEAGUE_CALLOUTS[active].icon;

  return (
    <div ref={containerRef} className="relative">
      {/* Desktop: two-column sticky */}
      <div className="hidden lg:grid lg:grid-cols-2 lg:gap-16 lg:items-start">
        {/* Sticky phone mockup */}
        <div className="sticky top-32 self-start">
          <div className="bg-gray-900 rounded-[2.5rem] p-3 shadow-2xl mx-auto max-w-[260px]">
            <div className="bg-gray-800 rounded-[2rem] overflow-hidden aspect-[9/19] flex flex-col items-center justify-center p-4">
              <AnimatePresence mode="wait">
                <motion.div
                  key={active}
                  initial={reduced ? false : { opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={reduced ? undefined : { opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3 }}
                  className={`w-full rounded-2xl p-6 border ${LEAGUE_CALLOUTS[active].color} flex flex-col gap-3 items-center text-center`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${LEAGUE_CALLOUTS[active].color}`}>
                    <ActiveIcon className={`w-6 h-6 ${LEAGUE_CALLOUTS[active].iconColor}`} />
                  </div>
                  <p className="text-xs font-semibold text-gray-700">{LEAGUE_CALLOUTS[active].eyebrow}</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{LEAGUE_CALLOUTS[active].headline}</p>
                  <div className="flex gap-1 mt-2">
                    {LEAGUE_CALLOUTS.map((_, i) => (
                      <div key={i} className={`h-1 rounded-full transition-all duration-300 ${i === active ? 'w-6 bg-[#3c82f4]' : 'w-1.5 bg-gray-600'}`} />
                    ))}
                  </div>
                </motion.div>
              </AnimatePresence>
              <div className="mt-3 text-center">
                <p className="text-gray-500 text-[10px]">Live preview</p>
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
                  <h3 className="text-3xl font-bold text-gray-900 mb-4">{c.headline}</h3>
                  <p className="text-lg text-gray-500 leading-relaxed max-w-md">{c.body}</p>
                </FadeUp>
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile: simple stack */}
      <div className="lg:hidden space-y-8">
        {LEAGUE_CALLOUTS.map((c, i) => {
          const Icon = c.icon;
          return (
            <FadeUp key={c.id} delay={i * 0.1}>
              <div className={`rounded-2xl p-6 border ${c.color}`}>
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-white`}>
                    <Icon className={`w-5 h-5 ${c.iconColor}`} />
                  </div>
                  <div>
                    <p className="text-xs font-bold tracking-widest text-gray-400 uppercase mb-1">{c.eyebrow}</p>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">{c.headline}</h3>
                    <p className="text-gray-500 text-sm leading-relaxed">{c.body}</p>
                  </div>
                </div>
              </div>
            </FadeUp>
          );
        })}
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
      {/* Launch banner */}
      <div className="fixed top-0 left-0 right-0 z-[60] bg-[#3c82f4] text-white text-center py-2.5 px-4 text-sm font-semibold tracking-wide">
        Launching June 1, 2026 —{' '}
        <button
          onClick={() => setLocation('/waitlist')}
          className="underline underline-offset-2 hover:no-underline font-bold"
        >
          Join the waitlist for early access
        </button>
      </div>

      {/* Sticky header */}
      <header className="fixed top-[40px] left-0 right-0 z-[70] bg-white/90 backdrop-blur-xl border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-0 grid grid-cols-3 items-center">
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <Link href="/" className="text-gray-500 hover:text-gray-900 transition-colors">Home</Link>
            <Link href="/features" className="text-gray-900 font-semibold">Features</Link>
            <Link href="/pricing" className="text-gray-500 hover:text-gray-900 transition-colors">Pricing</Link>
            <Link href="/about" className="text-gray-500 hover:text-gray-900 transition-colors">About</Link>
            <Link href="/referral-program" className="text-gray-500 hover:text-gray-900 transition-colors">Partners</Link>
          </nav>
          <div className="flex justify-center">
            <img src={rosterLightLogo} alt="Roster" className="h-10 object-contain" />
          </div>
          <div className="flex items-center gap-3 justify-end">
            <button
              onClick={() => setLocation('/waitlist')}
              className="px-4 py-2 rounded-full bg-[#3c82f4] text-white hover:bg-[#3c82f4]/90 transition-colors font-semibold text-xs sm:text-sm"
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
      <section className="py-24 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <FadeUp>
            <p className="text-xs font-bold tracking-widest text-[#3c82f4] uppercase text-center mb-3">Tournaments</p>
            <h2
              className="font-bold text-gray-900 text-center mb-4"
              style={{ fontSize: 'clamp(2rem, 4vw, 3.5rem)' }}
            >
              Run a tournament that doesn't take a month to set up.
            </h2>
            <p className="text-center text-gray-500 text-lg max-w-2xl mx-auto mb-16">
              From bracket to champion — automated, tracked, and updated in real time.
            </p>
          </FadeUp>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            {/* Left: features */}
            <div className="space-y-10">
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
                  body: 'Running a one-off tournament? Use Roster for just that weekend at $10/team. A lot of captains start here, then bring their whole league over.',
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

      {/* ── LEAGUE MANAGEMENT ────────────────────────────────── */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <FadeUp>
            <p className="text-xs font-bold tracking-widest text-[#3c82f4] uppercase text-center mb-3">League Management</p>
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
              <div className="text-4xl md:text-5xl font-black text-white mb-2">Built in Ohio.</div>
              <div className="text-blue-200 text-sm font-medium">Not a venture-backed startup. A real product from a real hockey town.</div>
            </FadeUp>
            <FadeUp delay={0.1}>
              <div className="text-4xl md:text-5xl font-black text-white mb-2">Hockey-first.</div>
              <div className="text-blue-200 text-sm font-medium">Every feature, every word, every screen.</div>
            </FadeUp>
            <FadeUp delay={0.2}>
              <div className="text-4xl md:text-5xl font-black text-white mb-2">Captain-built.</div>
              <div className="text-blue-200 text-sm font-medium">Roster was built by someone who's still running a beer league bench.</div>
            </FadeUp>
          </div>
        </div>
      </section>

      {/* ── QUICK-HIT GRID ───────────────────────────────────── */}
      <section className="py-24 px-6 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <FadeUp>
            <h2
              className="font-bold text-gray-900 text-center mb-4"
              style={{ fontSize: 'clamp(2rem, 4vw, 3.5rem)' }}
            >
              A few more things you'll notice on day one.
            </h2>
            <p className="text-center text-gray-500 text-lg max-w-xl mx-auto mb-16">
              Small details that make a real difference when you're in the rink at 10pm.
            </p>
          </FadeUp>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {GRID_FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <FadeUp key={f.headline} delay={i * 0.08}>
                  <div className="bg-white rounded-2xl border border-gray-200 p-6 hover:border-[#3c82f4]/40 hover:shadow-sm transition-all h-full">
                    <div className="w-10 h-10 rounded-xl bg-[#3c82f4]/10 border border-[#3c82f4]/20 flex items-center justify-center mb-4">
                      <Icon className="w-5 h-5 text-[#3c82f4]" />
                    </div>
                    <h3 className="text-base font-bold text-gray-900 mb-2">{f.headline}</h3>
                    <p className="text-gray-500 text-sm leading-relaxed">{f.body}</p>
                  </div>
                </FadeUp>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────── */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <FadeUp>
            <h2
              className="font-bold text-gray-900 text-center mb-4"
              style={{ fontSize: 'clamp(2rem, 4vw, 3.5rem)' }}
            >
              Three steps to a better-run league.
            </h2>
            <p className="text-center text-gray-500 text-lg max-w-xl mx-auto mb-16">
              Setup takes about 15 minutes. Your captains will notice the difference at the first game.
            </p>
          </FadeUp>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                icon: Users,
                title: 'Drop in your teams',
                body: 'Add your teams, captains, and schedule. Import from a spreadsheet or build it in the app.',
              },
              {
                step: '02',
                icon: Globe,
                title: 'Open registration',
                body: 'Send one link. Players register, pay, and sign the waiver. You\'re done.',
              },
              {
                step: '03',
                icon: Trophy,
                title: 'Drop the puck',
                body: 'Score games as they happen. Standings update. Brackets advance. You watch hockey instead of doing admin.',
              },
            ].map((item, i) => {
              const Icon = item.icon;
              return (
                <FadeUp key={item.step} delay={i * 0.1}>
                  <div className="relative">
                    {i < 2 && (
                      <div className="hidden md:block absolute top-10 left-[60%] w-full h-px bg-gradient-to-r from-[#3c82f4]/30 to-transparent z-0" />
                    )}
                    <div className="relative z-10 bg-white border border-gray-200 rounded-2xl p-8 hover:border-[#3c82f4]/40 hover:shadow-md transition-all shadow-sm h-full flex flex-col">
                      <div className="flex items-start gap-4 mb-4">
                        <div className="w-12 h-12 rounded-xl bg-[#3c82f4]/10 border border-[#3c82f4]/20 flex items-center justify-center flex-shrink-0">
                          <Icon className="w-6 h-6 text-[#3c82f4]" />
                        </div>
                        <span className="text-5xl font-black text-gray-200 leading-none mt-1">{item.step}</span>
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 mb-2">{item.title}</h3>
                      <p className="text-gray-500 leading-relaxed flex-1">{item.body}</p>
                    </div>
                  </div>
                </FadeUp>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── PRICING TEASER ───────────────────────────────────── */}
      <section className="py-16 px-6 bg-blue-50/60 border-y border-blue-100">
        <div className="max-w-3xl mx-auto text-center">
          <FadeUp>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Simple pricing. No nickel-and-diming.</h2>
            <p className="text-gray-500 text-lg mb-6 leading-relaxed">
              Free to start — no credit card required. Running a one-off tournament?
              Try Roster for just <span className="font-semibold text-gray-900">$10/team</span> with no commitment. That's the easiest way to see what it can do before you bring your full league over.
            </p>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 text-[#3c82f4] font-semibold hover:underline underline-offset-4 transition-colors text-lg"
            >
              See full pricing <ArrowRight className="w-4 h-4" />
            </Link>
          </FadeUp>
        </div>
      </section>

      {/* ── FINAL CTA ────────────────────────────────────────── */}
      <section className="py-28 px-6 bg-gradient-to-b from-white to-blue-50">
        <div className="max-w-3xl mx-auto text-center">
          <FadeUp>
            <h2
              className="font-bold text-gray-900 mb-5"
              style={{ fontSize: 'clamp(2.2rem, 4.5vw, 4rem)' }}
            >
              Ready to run a league worth playing in?
            </h2>
            <p className="text-gray-500 text-xl mb-2">
              Set up takes about 15 minutes. Your captains will notice the difference at the first game.
            </p>
            <p className="text-gray-400 text-sm mb-10">No credit card required · Free forever tier available</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => setLocation('/waitlist')}
                className="px-8 py-4 rounded-full bg-[#3c82f4] text-white hover:bg-[#3c82f4]/90 transition-colors font-semibold text-lg shadow-lg shadow-blue-200"
              >
                Start your league free
              </button>
              <a
                href="mailto:hello@roster-app.com"
                className="px-8 py-4 rounded-full border border-gray-300 text-gray-700 hover:border-gray-400 hover:text-gray-900 transition-colors font-semibold text-lg"
              >
                Talk to the founder
              </a>
            </div>
          </FadeUp>
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
