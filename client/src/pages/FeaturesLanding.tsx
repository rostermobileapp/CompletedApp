import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { AnimatePresence, motion, useReducedMotion, useInView } from 'framer-motion';
import { BarChart2, CreditCard, ClipboardList, MessageSquare, Trophy, Zap, Users, Shield, Smartphone, MessageSquareMore, Menu, X } from 'lucide-react';
import { useSeo } from '@/hooks/use-seo';
import rosterLightLogo from '@/assets/roster-light-logo.png';

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
      <div className="hidden lg:grid lg:grid-cols-2 lg:gap-16 lg:items-start">
        <div className="sticky top-32 self-start">
          <div ref={phoneRef} className="relative mx-auto" style={{ width: 260 }}>
            <div className="absolute" style={{ left: -3, top: 96, width: 3, height: 28, background: '#3a3a3c', borderRadius: '3px 0 0 3px' }} />
            <div className="absolute" style={{ left: -3, top: 144, width: 3, height: 44, background: '#3a3a3c', borderRadius: '3px 0 0 3px' }} />
            <div className="absolute" style={{ left: -3, top: 200, width: 3, height: 44, background: '#3a3a3c', borderRadius: '3px 0 0 3px' }} />
            <div className="absolute" style={{ right: -3, top: 156, width: 3, height: 64, background: '#3a3a3c', borderRadius: '0 3px 3px 0' }} />
            <div className="absolute" style={{ right: -3, top: 264, width: 3, height: 40, background: '#3a3a3c', borderRadius: '0 3px 3px 0' }} />
            <div style={{ background: 'linear-gradient(160deg, #2c2c2e 0%, #1c1c1e 50%, #2c2c2e 100%)', borderRadius: 52, padding: 3, boxShadow: '0 0 0 0.5px #555, inset 0 0 0 0.5px #444, 0 32px 64px -16px rgba(0,0,0,0.85), 0 8px 24px -4px rgba(0,0,0,0.5)' }}>
              <div style={{ background: '#000', borderRadius: 50, overflow: 'hidden', aspectRatio: '9/19.5', position: 'relative' }}>
                <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', width: 88, height: 28, background: '#000', borderRadius: 20, border: '1px solid #1a1a1a', boxShadow: 'inset 0 1px 4px rgba(0,0,0,0.9)', zIndex: 10 }} />
                <div className="w-full h-full flex flex-col items-center justify-center">
                  <AnimatePresence mode="wait">
                    <motion.div key={active} initial={reduced ? false : { opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={reduced ? undefined : { opacity: 0, scale: 0.95 }} transition={{ duration: 0.3 }} className="w-full h-full overflow-hidden">
                      {active === 0 ? (
                        <img src="/standings-preview.png" alt="League Standings" className="w-full h-full object-cover object-top" />
                      ) : active === 1 ? (
                        <img src="/scorekeeper-preview.png" alt="Live Scorekeeping" className="w-full h-full object-cover object-top" />
                      ) : active === 2 ? (
                        <img src="/messaging-preview.png" alt="Team Messaging" className="w-full h-full object-cover object-top" />
                      ) : active === 3 ? (
                        <img src="/payments-preview.png" alt="Registration & Payments" className="w-full h-full object-cover object-top" />
                      ) : null}
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>
        </div>

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

      <div className="lg:hidden space-y-8">
        {LEAGUE_CALLOUTS.map((c, i) => {
          const Icon = c.icon;
          return (
            <FadeUp key={c.id} delay={i * 0.1}>
              <div className="rounded-2xl p-6 border bg-blue-50 border-blue-100">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-white">
                    <Icon className="w-5 h-5 text-[#3c82f4]" />
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
    icon: MessageSquareMore,
    headline: 'Real human support',
    body: 'You can email the founder. Often you\'ll get a reply that night.',
  },
];

export default function FeaturesLanding() {
  const [, setLocation] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useSeo({
    title: 'Roster — Features Built for Hockey Leagues',
    description: 'Built by a beer league captain. Roster is the all-in-one league management platform for adult recreational hockey — tournaments, scorekeeping, standings, and registration in one app.',
    ogTitle: 'Roster — Features Built for Hockey Leagues',
    ogDescription: 'Built by a beer league captain. Roster is the all-in-one league management platform for adult recreational hockey.',
  });

  return <div />;
}
