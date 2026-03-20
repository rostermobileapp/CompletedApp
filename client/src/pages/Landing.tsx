import { Calendar, Check, Play, UserPlus, Trophy, Star, Shield, Zap, Menu, X } from 'lucide-react';
import appPreviewImage from "@assets/previewed_1768341988878.png";
import rosterLightLogo from "@assets/Light_Mode_Logo_1768322748282.png";
import { useEffect, useState, useRef } from 'react';
import { Link, useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { SiAppstore, SiGoogleplay } from 'react-icons/si';

function AnimatedCounter({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [displayValue, setDisplayValue] = useState(0);
  const prevValue = useRef(0);
  const hasStarted = useRef(false);
  const elementRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (value === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !hasStarted.current) {
          hasStarted.current = true;
          const start = prevValue.current;
          const end = value;
          const duration = 1800;
          const startTime = performance.now();

          const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(start + (end - start) * eased);
            setDisplayValue(current);
            if (progress < 1) {
              requestAnimationFrame(animate);
            } else {
              prevValue.current = end;
            }
          };
          requestAnimationFrame(animate);
        }
      },
      { threshold: 0.3 }
    );

    if (elementRef.current) observer.observe(elementRef.current);
    return () => observer.disconnect();
  }, [value]);

  return (
    <span ref={elementRef} className="tabular-nums font-extrabold">
      {displayValue.toLocaleString()}{suffix}
    </span>
  );
}

const testimonials = [
  {
    quote: "The app is sweet! You nailed it!",
    name: "Donny U.",
    team: "Wednesday Night Hockey",
    initials: "DU",
    gradient: "from-blue-500 to-blue-700",
  },
  {
    quote: "The RSVP system alone is worth every penny. Our captain used to spend hours confirming lineups. Not anymore.",
    name: "Sarah K.",
    team: "Sunday Hockey Co-ed",
    initials: "SK",
    gradient: "from-purple-500 to-purple-700",
  },
  {
    quote: "We run three hockey leagues through Roster now. Scheduling, scores, standings — it handles all of it.",
    name: "Derek R.",
    team: "City Adult Hockey League",
    initials: "DR",
    gradient: "from-emerald-500 to-emerald-700",
  },
  {
    quote: "Switched from TeamSnap and never looked back. Half the price, twice the features.",
    name: "Jen M.",
    team: "Women's Hockey League",
    initials: "JM",
    gradient: "from-orange-500 to-orange-700",
  },
  {
    quote: "The player sub system is the crown jewel of Roster. This feature alone makes Roster worth it if you are a captain.",
    name: "TJ K.",
    team: "Tuesday Drop-In Hockey",
    initials: "TJ",
    gradient: "from-rose-500 to-rose-700",
  },
  {
    quote: "Our whole tournament went smoothly this year. Brackets, scheduling, scores — done.",
    name: "Aisha P.",
    team: "Regional Hockey Club",
    initials: "AP",
    gradient: "from-teal-500 to-teal-700",
  },
];

const howItWorks = [
  {
    step: "01",
    icon: UserPlus,
    title: "Create Your Team",
    description: "Sign up free, build your hockey roster, and invite players in minutes.",
  },
  {
    step: "02",
    icon: Calendar,
    title: "Schedule & Track",
    description: "Import your season schedule, collect RSVPs, and send automatic reminders — no more chasing.",
  },
  {
    step: "03",
    icon: Trophy,
    title: "Play & Win",
    description: "Track stats, manage standings, run tournaments, and keep your whole league connected.",
  },
];

export default function Landing() {
  const [scrollY, setScrollY] = useState(0);
  const [, setLocation] = useLocation();
  const [loginMessageVisible, setLoginMessageVisible] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const { data: userCountData } = useQuery<{ count: number }>({
    queryKey: ['/api/user-count'],
    refetchInterval: 30000,
  });

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const userCount = userCountData?.count ?? 0;

  const handleLoginClick = () => {
    setLoginMessageVisible(true);
    setTimeout(() => setLoginMessageVisible(false), 3000);
  };

  return (
    <div className="min-h-screen bg-white text-gray-900" data-testid="landing-page">
      {/* Launch date banner — fixed at very top */}
      <div className="fixed top-0 left-0 right-0 z-[60] bg-[#3c82f4] text-white text-center py-2.5 px-4 text-sm font-semibold tracking-wide">
        🚀 Launching May 1, 2026 — <button onClick={() => setLocation('/waitlist')} className="underline underline-offset-2 hover:no-underline font-bold">Join the waitlist for early access</button>
      </div>
      {/* "Come back May 1st" toast */}
      {loginMessageVisible && (
        <div className="fixed top-[80px] left-1/2 -translate-x-1/2 z-[100] bg-white border border-gray-200 text-gray-900 px-6 py-3 rounded-xl shadow-2xl text-sm font-semibold">
          🗓️ Come back May 1st — we're not live yet!
        </div>
      )}
      {/* Fixed Header */}
      <header className="fixed top-[44px] left-0 right-0 z-[70] bg-white/90 backdrop-blur-xl border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center pt-[0px] pb-[0px]">
          <nav className="hidden md:flex flex-wrap items-center gap-6 text-sm">
            <Link href="/" className="text-gray-500 hover:text-gray-900 transition-colors">Home</Link>
            <a href="#how-it-works" className="text-gray-500 hover:text-gray-900 transition-colors">How It Works</a>
            <a href="#features" className="text-gray-500 hover:text-gray-900 transition-colors">Features</a>
            <Link href="/pricing" className="text-gray-500 hover:text-gray-900 transition-colors">Pricing</Link>
            <Link href="/about" className="text-gray-500 hover:text-gray-900 transition-colors">About</Link>
          </nav>
          <img
            src={rosterLightLogo}
            alt="Roster"
            className="h-10 object-contain"
            data-testid="logo-image"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={handleLoginClick}
              className="hidden md:block text-sm text-gray-400 cursor-not-allowed font-medium"
              title="Come back May 1st"
            >
              Log In
            </button>
            <button
              onClick={() => setLocation('/waitlist')}
              className="px-4 py-2 rounded-full bg-[#3c82f4] text-white hover:bg-[#3c82f4]/90 transition-colors font-semibold text-xs sm:text-sm"
              data-testid="button-join-waitlist-header"
            >
              Join Waitlist
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-gray-600 hover:text-gray-900"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
        
        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-200 bg-white">
            <div className="px-6 py-4 space-y-3">
              <Link href="/" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-gray-600 hover:text-gray-900 transition-colors">Home</Link>
              <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-gray-600 hover:text-gray-900 transition-colors">How It Works</a>
              <a href="#features" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-gray-600 hover:text-gray-900 transition-colors">Features</a>
              <Link href="/pricing" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-gray-600 hover:text-gray-900 transition-colors">Pricing</Link>
              <Link href="/about" onClick={() => setMobileMenuOpen(false)} className="block text-sm text-gray-600 hover:text-gray-900 transition-colors">About</Link>
            </div>
          </div>
        )}
      </header>
      {/* Hero Section */}
      <section className="relative pb-20 px-6 overflow-hidden bg-gradient-to-b from-blue-50/60 to-white" style={{ paddingTop: 'calc(44px + 60px)' }}>
        <div
          className="absolute inset-0 bg-gradient-to-b from-[#3c82f4]/5 via-transparent to-transparent"
          style={{ transform: `translateY(${scrollY * 0.4}px)` }}
        />
        <div className="max-w-6xl mx-auto relative z-10">
          {/* Trust badge */}
          {userCount > 0 && (
            <div className="flex justify-center mb-6">
              <div className="inline-flex items-center gap-2 bg-[#3c82f4]/10 border border-[#3c82f4]/25 rounded-full px-4 py-2">
                <div className="w-2 h-2 rounded-full bg-[#3c82f4] animate-pulse" />
                <span className="text-sm font-medium text-[#3c82f4] flex items-center gap-1">
                  <AnimatedCounter value={userCount} /> players already using <img src={rosterLightLogo} alt="Roster" className="h-4 object-contain" />
                </span>
              </div>
            </div>
          )}

          {/* Hero headline */}
          <div className="text-center mb-10">
            <h1
              className="text-5xl md:text-7xl lg:text-8xl font-bold mb-6 leading-tight tracking-tight text-gray-900"
              data-testid="text-hero-title"
            >
              The easiest way to manage
              <br />
              <span className="text-[#3c82f4]">your hockey team.</span>
            </h1>
            <p className="text-xl md:text-2xl text-gray-600 max-w-3xl mx-auto mb-8">
              Built for hockey. Scheduling, RSVPs, rosters, stats, payments, and messaging — all in one place. No ads. Ever.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-8">
              <button
                onClick={() => setLocation('/waitlist')}
                className="px-8 py-4 rounded-full bg-[#3c82f4] text-white hover:bg-[#3c82f4]/90 transition-colors font-semibold text-lg shadow-lg shadow-blue-200"
                data-testid="button-join-waitlist"
              >
                Join the Waitlist
              </button>
              <button
                onClick={handleLoginClick}
                className="px-8 py-4 rounded-full border border-gray-300 text-gray-400 cursor-not-allowed font-semibold text-lg"
                title="Come back May 1st"
              >
                Log In
              </button>
            </div>

            {/* App Store Badges */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center mb-2" data-testid="app-store-badges">
              <button
                disabled
                className="flex items-center gap-3 bg-gray-300 border border-gray-300 rounded-xl px-5 py-3 cursor-not-allowed opacity-50 pl-[4px] pr-[4px]"
                title="Coming May 1st"
                aria-label="Download on the App Store - Coming May 1st"
              >
                <SiAppstore className="w-7 h-7 text-gray-500" />
                <div className="text-left">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wide">Download on the</div>
                  <div className="text-base font-semibold text-gray-600 leading-tight">App Store</div>
                </div>
              </button>
              <button
                disabled
                className="flex items-center gap-3 bg-gray-300 border border-gray-300 rounded-xl px-5 py-3 cursor-not-allowed opacity-50 pl-[4px] pr-[4px]"
                title="Coming May 1st"
                aria-label="Get it on Google Play - Coming May 1st"
              >
                <SiGoogleplay className="w-6 h-6 text-gray-500" />
                <div className="text-left">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wide">Get it on</div>
                  <div className="text-base font-semibold text-gray-600 leading-tight">Google Play</div>
                </div>
              </button>
            </div>
            <p className="text-xs text-gray-400">No credit card required · Free forever tier available</p>
          </div>

          {/* Hero image + problem copy */}
          <div className="flex flex-col md:flex-row gap-10 items-center justify-center mt-10">
            <div
              className="w-full md:w-2/5 max-w-[300px] flex-shrink-0"
              data-testid="image-hero"
            >
              <img
                src={appPreviewImage}
                alt="Roster app preview showing team management features"
                className="w-full h-auto rounded-3xl shadow-2xl shadow-blue-100"
              />
            </div>
            <div
              className="text-left md:w-3/5 max-w-xl"
              data-testid="text-hero-body"
            >
              <p className="text-2xl font-semibold mb-4 text-gray-900">Every hockey team falls apart the same way.</p>
              <p className="text-lg text-gray-600 mb-6">Nobody knows who's on the ice. Nobody knows when the game is. Half the team just doesn't show up.</p>
              <div className="space-y-3 mb-6">
                {["Endless group texts that go nowhere", "Half-baked spreadsheets nobody updates", "Email chains from 2018"].map((pain) => (
                  <div key={pain} className="flex items-center gap-3">
                    <span className="text-red-500 text-lg font-bold">✕</span>
                    <span className="text-gray-500 text-lg line-through">{pain}</span>
                  </div>
                ))}
              </div>
              <p className="text-3xl font-black text-[#3c82f4] mb-4 flex items-center gap-2"><img src={rosterLightLogo} alt="Roster" className="h-10 object-contain" /> fixes all of it.</p>
              <p className="text-lg text-gray-600">One app, built by frustrated players, for players. Your schedule, your lineup, your team — organized. Finally.</p>
            </div>
          </div>
        </div>
      </section>
      {/* Video Demo Section */}
      <section className="py-20 px-6 bg-gray-50" id="demo">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-5xl font-bold mb-4 text-gray-900 flex items-center justify-center gap-2">
            See <img src={rosterLightLogo} alt="Roster" className="h-12 md:h-16 object-contain" /> in action.
          </h2>
          <p className="text-gray-500 text-lg mb-10">Watch how teams go from chaos to organized in under 5 minutes.</p>

          <div className="relative rounded-2xl overflow-hidden border border-gray-200 bg-gray-100 aspect-video shadow-xl group cursor-pointer">
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
              <div className="w-20 h-20 rounded-full bg-[#3c82f4] flex items-center justify-center shadow-lg shadow-blue-300/50 group-hover:scale-110 transition-transform">
                <Play className="w-8 h-8 text-white ml-1" fill="white" />
              </div>
              <p className="text-gray-500 text-sm font-medium">Product Walkthrough — 90 seconds</p>
            </div>
            <div className="absolute inset-0 bg-gradient-to-br from-[#3c82f4]/5 via-transparent to-[#3c82f4]/5" />
            <div
              className="absolute inset-0 opacity-30"
              style={{
                backgroundImage: 'linear-gradient(rgba(60,130,244,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(60,130,244,0.15) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
              }}
            />
          </div>
          <p className="text-gray-400 text-xs mt-3">Video demo coming soon — sign up to get early access</p>
        </div>
      </section>
      {/* How It Works */}
      <section className="py-24 px-6 bg-white" id="how-it-works">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-4 text-gray-900">
              Up and running in minutes.
            </h2>
            <p className="text-gray-500 text-lg max-w-2xl mx-auto">No training required. No complex setup. Just sign up and go.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {howItWorks.map((item, index) => (
              <div key={item.step} className="relative">
                {index < howItWorks.length - 1 && (
                  <div className="hidden md:block absolute top-10 left-[60%] w-full h-px bg-gradient-to-r from-[#3c82f4]/30 to-transparent z-0" />
                )}
                <div className="relative z-10 bg-white border border-gray-200 rounded-2xl p-8 hover:border-[#3c82f4]/40 hover:shadow-md transition-all shadow-sm h-full flex flex-col">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-14 h-14 rounded-xl bg-[#3c82f4]/10 border border-[#3c82f4]/20 flex items-center justify-center flex-shrink-0">
                      <item.icon className="w-7 h-7 text-[#3c82f4]" />
                    </div>
                    <span className="text-5xl font-black text-gray-200 leading-none mt-1">{item.step}</span>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">{item.title}</h3>
                  <p className="text-gray-500 leading-relaxed flex-1">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      {/* Social Proof Stats Bar */}
      <section className="py-14 px-6 border-y border-gray-100 bg-blue-50/40">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <div className="text-4xl md:text-5xl font-black text-[#3c82f4] mb-1">
                {userCount > 0 ? <AnimatedCounter value={userCount} suffix="+" /> : '1,000+'}
              </div>
              <div className="text-gray-500 text-sm font-medium">Players Registered</div>
            </div>
            <div>
              <div className="text-4xl md:text-5xl font-black text-[#3c82f4] mb-1">🏒</div>
              <div className="text-gray-500 text-sm font-medium">Built for Hockey</div>
            </div>
            <div>
              <div className="text-4xl md:text-5xl font-black text-[#3c82f4] mb-1">
                <AnimatedCounter value={0} />
                <span className="font-black"> Ads</span>
              </div>
              <div className="text-gray-500 text-sm font-medium">Ever. On Any Plan.</div>
            </div>
            <div>
              <div className="text-4xl md:text-5xl font-black text-[#3c82f4] mb-1">$0</div>
              <div className="text-gray-500 text-sm font-medium">To Get Started</div>
            </div>
          </div>
        </div>
      </section>
      {/* Features Section - Comparison Table */}
      <section className="py-24 px-6 bg-white" id="features">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-6xl font-bold mb-4 text-gray-900" data-testid="text-features-heading">
              Everything you need.
              <br />
              <span className="text-[#3c82f4]">All in one place.</span>
            </h2>
            <p className="text-gray-500 text-lg max-w-2xl mx-auto">See how Roster stacks up against the competition — for a fraction of the price.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse bg-white rounded-xl border border-gray-200 shadow-sm" data-testid="comparison-table">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left p-4 font-bold text-gray-900">Feature</th>
                  <th className="text-center p-4 font-bold bg-[#3c82f4]/8 text-gray-900 border border-[#3c82f4]/20">
                    <div className="flex flex-col items-center gap-1">
                      <img src={rosterLightLogo} alt="Roster" className="h-6 object-contain" />
                      <span className="text-xs font-normal text-[#3c82f4] bg-[#3c82f4]/10 rounded-full px-2 py-0.5">Best Value</span>
                    </div>
                  </th>
                  <th className="text-center p-4 font-bold text-gray-700">BenchApp</th>
                  <th className="text-center p-4 font-bold text-gray-700">TeamSnap</th>
                  <th className="text-center p-4 font-bold text-gray-700">SportsEngine HQ</th>
                  <th className="text-center p-4 font-bold text-gray-700">Crossbar</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-100">
                  <td className="p-4 font-medium text-gray-900">Price</td>
                  <td className="text-center p-4 bg-[#3c82f4]/5 font-bold text-[#3c82f4]">$6.49 / Month</td>
                  <td className="text-center p-4 text-gray-700">$9 / Month</td>
                  <td className="text-center p-4 text-gray-700">$16 / Month</td>
                  <td className="text-center p-4 text-gray-700">$1,299 / Year</td>
                  <td className="text-center p-4 text-gray-700">$995 / Year</td>
                </tr>
                <tr className="border-b border-gray-100">
                  <td className="p-4 text-gray-900">Annoying Ads</td>
                  <td className="text-center p-4 bg-[#3c82f4]/5 font-bold text-[#3c82f4]">NEVER</td>
                  <td className="text-center p-4 text-red-500 font-semibold">MULTIPLE</td>
                  <td className="text-center p-4 text-red-500 font-semibold">TONS</td>
                  <td className="text-center p-4 text-red-500 font-semibold">ALWAYS</td>
                  <td className="text-center p-4 text-gray-700">No</td>
                </tr>
                {[
                  { label: "Team Scheduling", roster: true, bench: true, snap: true, engine: true, cross: true },
                  { label: "Roster Management", roster: true, bench: true, snap: true, engine: true, cross: true },
                  { label: "Player/Attendance Tracking", roster: true, bench: true, snap: true, engine: true, cross: true },
                  { label: "In App Messaging", roster: true, bench: true, snap: true, engine: true, cross: true },
                  { label: "In App RSVP", roster: true, bench: false, snap: true, engine: false, cross: true },
                  { label: "Player Substitution System", roster: true, bench: false, snap: false, engine: false, cross: false },
                  { label: "Polls/Bulletins", roster: true, bench: true, snap: true, engine: false, cross: false },
                  { label: "Facility Event Calendar", roster: true, bench: false, snap: false, engine: false, cross: false },
                  { label: "Fee & Payment Tracking", roster: true, bench: true, snap: true, engine: true, cross: true },
                  { label: "Links to Venmo/CashApp", roster: true, bench: false, snap: false, engine: false, cross: false },
                  { label: "Team Expense Tracking", roster: true, bench: true, snap: true, engine: true, cross: true },
                  { label: "Mobile App", roster: true, bench: true, snap: true, engine: true, cross: true },
                  { label: "Website Portal", roster: true, bench: false, snap: true, engine: true, cross: true },
                  { label: "Multi-Team/Org Management", roster: true, bench: true, snap: true, engine: true, cross: true },
                  { label: "Registration Notices", roster: true, bench: false, snap: true, engine: true, cross: true },
                  { label: "Volunteer/Role Assignment", roster: true, bench: true, snap: true, engine: true, cross: true },
                  { label: "Custom Awards", roster: true, bench: false, snap: false, engine: false, cross: false },
                  { label: "Tournaments Mode", roster: true, bench: false, snap: false, engine: true, cross: true },
                ].map(({ label, roster, bench, snap, engine, cross }) => (
                  <tr key={label} className="border-b border-gray-100 last:border-0">
                    <td className="p-4 text-gray-800">{label}</td>
                    <td className="text-center p-4 bg-[#3c82f4]/5">
                      {roster ? <Check className="w-5 h-5 text-[#3c82f4] inline" /> : <span className="text-red-500 text-xl font-bold">✕</span>}
                    </td>
                    <td className="text-center p-4">
                      {bench ? <Check className="w-5 h-5 text-green-600 inline" /> : <span className="text-red-400 text-xl font-bold">✕</span>}
                    </td>
                    <td className="text-center p-4">
                      {snap ? <Check className="w-5 h-5 text-green-600 inline" /> : <span className="text-red-400 text-xl font-bold">✕</span>}
                    </td>
                    <td className="text-center p-4">
                      {engine ? <Check className="w-5 h-5 text-green-600 inline" /> : <span className="text-red-400 text-xl font-bold">✕</span>}
                    </td>
                    <td className="text-center p-4">
                      {cross ? <Check className="w-5 h-5 text-green-600 inline" /> : <span className="text-red-400 text-xl font-bold">✕</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      {/* Testimonials Section */}
      <section className="py-24 px-6 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold mb-4 text-gray-900">What players are saying</h2>
            <p className="text-gray-500 text-lg">Real players. Real teams. Real results.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {testimonials.map((t) => (
              <div
                key={t.name}
                className="bg-white border border-gray-200 rounded-2xl p-6 hover:shadow-md transition-all flex flex-col gap-4 shadow-sm"
              >
                <div className="flex items-center gap-1">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                  ))}
                </div>
                <p className="text-gray-700 leading-relaxed flex-1">"{t.quote}"</p>
                <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                  <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${t.gradient} flex items-center justify-center text-white text-sm font-bold flex-shrink-0 shadow-sm ring-2 ring-white`}>
                    {t.initials}
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900 text-sm">{t.name}</div>
                    <div className="text-gray-400 text-xs">{t.team}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      {/* Pricing Section */}
      <section className="py-24 px-6 bg-white" id="pricing">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-6xl font-bold mb-4 text-gray-900" data-testid="text-pricing-heading">
              Simple pricing.
              <br />
              <span className="text-gray-400">No surprises.</span>
            </h2>
            <p className="text-gray-500 text-lg">Free to start. No credit card required. No ads on any plan.</p>
          </div>

          {/* Trust strip */}
          <div className="flex flex-wrap justify-center gap-6 mb-12">
            {[
              { icon: Shield, text: 'No ads. Ever.' },
              { icon: Zap, text: 'Cancel Anytime' },
              { icon: Check, text: 'Free to Start' },
              { icon: Check, text: 'No Credit Card Required' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2 text-gray-500">
                <Icon className="w-4 h-4 text-[#3c82f4]" />
                <span className="text-sm font-medium">{text}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 max-w-6xl mx-auto">
            {/* Free Tier */}
            <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm" data-testid="card-pricing-free">
              <h3 className="text-2xl font-bold mb-2 text-gray-900" data-testid="text-tier-free">FREE</h3>
              <div className="mb-6">
                <span className="text-5xl font-bold text-gray-900" data-testid="text-price-free">$0</span>
                <span className="text-gray-400"> / Month</span>
              </div>
              <p className="text-gray-500 text-sm mb-6">Perfect for players joining their first team. No strings attached.</p>
              <ul className="space-y-3 mb-8">
                {['Join Leagues / Teams', 'Scheduling', 'RSVP Function', 'Team Only Stats'].map((f, i) => (
                  <li key={f} className="flex items-start gap-3" data-testid={`feature-free-${i}`}>
                    <Check className="w-5 h-5 text-[#3c82f4] flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-gray-700">{f}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => setLocation('/waitlist')}
                className="w-full py-3 px-6 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors font-semibold text-gray-900"
                data-testid="button-pricing-free"
              >
                Join the Waitlist
              </button>
            </div>

            {/* Player Pro */}
            <div className="bg-[#3c82f4] rounded-3xl p-8 border-2 border-[#3c82f4] relative shadow-xl shadow-blue-200" data-testid="card-pricing-player-pro">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs font-bold px-4 py-1.5 rounded-full">
                MOST POPULAR
              </div>
              <h3 className="text-2xl font-bold mb-2 text-white" data-testid="text-tier-player-pro">Player Pro</h3>
              <div className="mb-6">
                <span className="text-5xl font-bold text-white" data-testid="text-price-player-pro">$6.49</span>
                <span className="text-blue-200"> / Month</span>
              </div>
              <p className="text-blue-100 text-sm mb-6">For serious players who want the full experience — messaging, payments, and more.</p>
              <ul className="space-y-3 mb-8">
                {['FREE +', 'Team Management', 'In-App Messaging', 'In-App Payments', 'Team Scheduling', 'League Stats', 'League Standings', 'League Announcements'].map((f, i) => (
                  <li key={f} className="flex items-start gap-3" data-testid={`feature-player-pro-${i}`}>
                    <Check className="w-5 h-5 text-white flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-white">{f}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => setLocation('/waitlist')}
                className="w-full py-3 px-6 rounded-full bg-white hover:bg-blue-50 transition-colors font-semibold text-[#3c82f4]"
                data-testid="button-pricing-player-pro"
              >
                Join the Waitlist
              </button>
            </div>

            {/* Commissioner */}
            <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm" data-testid="card-pricing-commissioner">
              <h3 className="text-2xl font-bold mb-2 text-gray-900" data-testid="text-tier-commissioner">Commissioner</h3>
              <div className="mb-6">
                <span className="text-5xl font-bold text-gray-900" data-testid="text-price-commissioner">$12</span>
                <span className="text-gray-400"> / Month</span>
              </div>
              <p className="text-gray-500 text-sm mb-6">Run a full league with schedules, scores, standings, and tournaments.</p>
              <ul className="space-y-3 mb-8">
                {['FREE & PLAYER PRO +', 'League Scheduling', 'Scorekeeping', 'Player Management', 'League Wide Posts', 'Awards & Records*', 'Bracket Management*'].map((f, i) => (
                  <li key={f} className="flex items-start gap-3" data-testid={`feature-commissioner-${i}`}>
                    <Check className="w-5 h-5 text-[#3c82f4] flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-gray-700">{f}</span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => setLocation('/waitlist')}
                className="w-full py-3 px-6 rounded-full border-2 border-gray-200 hover:border-[#3c82f4] hover:text-[#3c82f4] transition-colors font-semibold text-gray-900"
                data-testid="button-pricing-commissioner"
              >
                Join the Waitlist
              </button>
            </div>
          </div>
          <div className="text-center mt-10">
            <Link href="/pricing" className="inline-flex items-center gap-2 text-[#3c82f4] font-semibold hover:underline underline-offset-4 transition-colors">
              View full pricing details &rarr;
            </Link>
          </div>
        </div>
      </section>
      {/* Final CTA */}
      <section className="py-24 px-6 bg-gradient-to-b from-blue-50 to-white">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl md:text-6xl font-bold mb-6 text-gray-900">
            Ready for your
            <br />
            <span className="text-[#3c82f4]">best season yet?</span>
          </h2>
          <p className="text-gray-500 text-xl mb-3">We launch <span className="text-gray-900 font-semibold">May 1, 2026</span>. Get early access by joining the waitlist — free forever tier available on day one.</p>
          <p className="text-gray-400 text-sm mb-8">No credit card required · No ads on any plan</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
            <button
              onClick={() => setLocation('/waitlist')}
              className="px-8 py-4 rounded-full bg-[#3c82f4] text-white hover:bg-[#3c82f4]/90 transition-colors font-semibold text-lg shadow-lg shadow-blue-200"
            >
              Join the Waitlist
            </button>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="https://apps.apple.com/us/app/roster-app/id6741723004"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-xl px-5 py-3 transition-colors justify-center"
            >
              <SiAppstore className="w-6 h-6 text-white" />
              <div className="text-left">
                <div className="text-[10px] text-gray-400 uppercase tracking-wide">Download on the</div>
                <div className="text-sm font-semibold text-white leading-tight">App Store</div>
              </div>
            </a>
            <a
              href="https://play.google.com/store/search?q=roster+team+management&c=apps"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-xl px-5 py-3 transition-colors justify-center"
            >
              <SiGoogleplay className="w-5 h-5 text-white" />
              <div className="text-left">
                <div className="text-[10px] text-gray-400 uppercase tracking-wide">Get it on</div>
                <div className="text-sm font-semibold text-white leading-tight">Google Play</div>
              </div>
            </a>
          </div>
        </div>
      </section>
      {/* Footer */}
      <footer className="border-t border-gray-200 py-12 px-6 bg-white" data-testid="footer">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10 text-sm">
            <div>
              <p className="font-semibold text-gray-900 mb-3">Product</p>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="/#features" className="hover:text-gray-900 transition-colors">Features</Link></li>
                <li><Link href="/pricing" className="hover:text-gray-900 transition-colors">Pricing</Link></li>
                <li><Link href="/waitlist" className="hover:text-gray-900 transition-colors">Join Waitlist</Link></li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-3">Company</p>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="/about" className="hover:text-gray-900 transition-colors">About</Link></li>
                <li><Link href="/privacy-policy" className="hover:text-gray-900 transition-colors" data-testid="link-privacy-policy">Privacy Policy</Link></li>
                <li><Link href="/terms-of-service" className="hover:text-gray-900 transition-colors" data-testid="link-terms-of-service">Terms of Service</Link></li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-3">By Sport</p>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="/hockey" className="hover:text-gray-900 transition-colors">Hockey</Link></li>
                <li><Link href="/soccer" className="hover:text-gray-900 transition-colors">Soccer</Link></li>
                <li><Link href="/baseball" className="hover:text-gray-900 transition-colors">Baseball</Link></li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-3">By Team Type</p>
              <ul className="space-y-2 text-gray-400">
                <li><Link href="/for-youth-teams" className="hover:text-gray-900 transition-colors">Youth Teams</Link></li>
                <li><Link href="/for-adult-leagues" className="hover:text-gray-900 transition-colors">Adult Leagues</Link></li>
                <li><Link href="/for-varsity" className="hover:text-gray-900 transition-colors">Varsity & Competitive</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-100 pt-6">
            <p className="text-sm text-gray-400 text-center flex items-center justify-center gap-2" data-testid="text-footer">
              © 2025 <img src={rosterLightLogo} alt="Roster" className="h-4 object-contain" />. Built for teams, by team players. No ads. Ever.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
