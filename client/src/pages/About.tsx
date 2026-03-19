import { MarketingLayout } from '@/components/MarketingLayout';
import { useLocation } from 'wouter';
import { Users, MessageSquare, CheckCircle } from 'lucide-react';
import founderPhoto from '@assets/signal-2026-03-19-124000_1773938439115.jpeg';

export default function About() {
  const [, setLocation] = useLocation();

  return (
    <MarketingLayout
      title="About Roster | Built by a Hockey Player Who Got Tired of the Chaos"
      description="Roster was built by a frustrated hockey captain who was sick of managing his team through group texts and spreadsheets. Here's his story."
      ogTitle="About Roster — The Founder's Story"
      ogDescription="A hockey team management app built by a frustrated captain, for captains. Here's the story behind Roster."
    >

      {/* ── 1. FOUNDER INTRO ─────────────────────────────────────── */}
      <section className="py-20 px-6 bg-gradient-to-b from-blue-50/60 to-white">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row items-center gap-12">
            {/* Founder photo — 9:16 portrait */}
            <div className="flex-shrink-0 w-48 md:w-56">
              <div className="relative aspect-[9/16] rounded-3xl overflow-hidden shadow-2xl shadow-blue-100">
                <img
                  src={founderPhoto}
                  alt="Tyler Frenette, Roster founder, on the ice"
                  className="w-full h-full object-cover object-top"
                />
              </div>
            </div>

            {/* Intro copy */}
            <div className="text-center md:text-left">
              <div className="inline-flex items-center gap-2 bg-[#3c82f4]/10 border border-[#3c82f4]/25 rounded-full px-4 py-1.5 mb-4">
                <span className="text-sm font-medium text-[#3c82f4]">Meet the founder</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4 leading-tight">
                Tyler Frenette
              </h1>
              <p className="text-[#3c82f4] font-semibold text-lg mb-1">Founder & CEO, Roster</p>
              <p className="text-gray-400 text-sm mb-6">Hockey player · Team captain · Beer-leaguer for life</p>
              <p className="text-gray-600 text-lg leading-relaxed max-w-xl">
                Tyler didn't set out to build a software company. He set out to stop losing ice time because nobody could figure out who was showing up.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. WHY HE STARTED ROSTER ─────────────────────────────── */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <span className="inline-block text-[#3c82f4] text-sm font-bold uppercase tracking-widest mb-3">The Origin</span>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6 leading-snug">
                Why he built Roster
              </h2>
              <div className="space-y-4 text-gray-600 text-lg leading-relaxed">
                <p>
                  For six years, Tyler captained a Wednesday night hockey league. What started as a simple favor — "someone has to organize this" — turned into a part-time job. Every week meant chasing 20 adults through a group text, manually tallying RSVPs, and still showing up to games shorthanded.
                </p>
                <p>
                  He tried everything. TeamSnap was expensive and buried in ads. BenchApp felt half-finished. Spreadsheets broke the moment someone edited the wrong cell. Nothing solved the actual problem: <em>getting reliable answers from busy people who just want to play hockey.</em>
                </p>
                <p>
                  The breaking point came on a Tuesday night in February. Tyler's team showed up to the rink with 8 skaters for a full-sheet game. Nobody had confirmed. Nobody knew. They paid for an hour of ice and skated 4-on-4.
                </p>
              </div>
            </div>

            {/* Pull quote card */}
            <div className="space-y-5">
              <div className="bg-[#3c82f4] rounded-3xl p-8 shadow-xl shadow-blue-200">
                <p className="text-white text-2xl font-semibold leading-snug mb-4">
                  "We paid for full-sheet ice and skated 4-on-4. That was the last time."
                </p>
                <p className="text-blue-200 text-sm font-medium">— Tyler, on the moment Roster was born</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 border border-gray-100 rounded-2xl p-5 text-center">
                  <p className="text-3xl font-black text-gray-900 mb-1">6</p>
                  <p className="text-sm text-gray-500">Years as captain before building Roster</p>
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-2xl p-5 text-center">
                  <p className="text-3xl font-black text-gray-900 mb-1">4</p>
                  <p className="text-sm text-gray-500">Apps he tried before deciding to build his own</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 3. HOW HE BUILT IT RIGHT ─────────────────────────────── */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <span className="inline-block text-[#3c82f4] text-sm font-bold uppercase tracking-widest mb-3">The Process</span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              How he made sure Roster was built right
            </h2>
            <p className="text-gray-500 text-lg max-w-2xl mx-auto">
              Tyler didn't build Roster in isolation. He spent a year talking to captains, coaches, and commissioners before writing a line of code.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            {[
              {
                icon: Users,
                number: '200+',
                label: 'Players & captains interviewed',
                description: 'Tyler sat down with beer leaguers, recreational players, and league commissioners to understand what actually went wrong every week — not what looked good in a feature list.',
              },
              {
                icon: MessageSquare,
                number: '7',
                label: 'Competing apps tested in full',
                description: 'He ran his own league through every major app on the market for at least one season. He documented what worked, what failed, and what drove his players crazy.',
              },
              {
                icon: CheckCircle,
                number: '3',
                label: 'Beta leagues before launch',
                description: 'Before the public launch, three real leagues used Roster through a full season. Every bug, every workflow gap, and every confusing screen was fixed based on real feedback.',
              },
            ].map((item) => (
              <div key={item.label} className="bg-white border border-gray-200 rounded-2xl p-7 shadow-sm">
                <div className="w-12 h-12 rounded-xl bg-[#3c82f4]/10 border border-[#3c82f4]/20 flex items-center justify-center mb-4">
                  <item.icon className="w-6 h-6 text-[#3c82f4]" />
                </div>
                <p className="text-4xl font-black text-gray-900 mb-1">{item.number}</p>
                <p className="text-sm font-semibold text-[#3c82f4] mb-3">{item.label}</p>
                <p className="text-gray-500 text-sm leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
            <p className="text-gray-700 text-lg leading-relaxed">
              The result is an app that's built around how recreational hockey actually works — not how a product manager imagined it might work. Every feature in Roster exists because a real captain asked for it, struggled without it, or wasted time working around the fact that it didn't exist.
            </p>
          </div>
        </div>
      </section>

      {/* ── 4. HOCKEY COMMUNITY CONNECTION ───────────────────────── */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            {/* Stats/community grid */}
            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: '🏒', label: 'Plays in 2 active hockey leagues', sub: 'Still lacing up every week' },
                { icon: '📋', label: 'Former captain for 6 seasons', sub: 'Wednesday Night Hockey League' },
                { icon: '🏟️', label: 'Relationships with 12+ rinks', sub: 'Across the region' },
                { icon: '🏆', label: 'Ran 3 recreational tournaments', sub: 'Brackets, scheduling, the works' },
                { icon: '⭐', label: 'Trusted by 50+ early team captains', sub: 'Who tested Roster pre-launch' },
                { icon: '📅', label: '8 years playing recreational hockey', sub: 'Beer league to competitive' },
              ].map((item, i) => (
                <div key={i} className="bg-gray-50 border border-gray-100 rounded-2xl p-5 hover:border-[#3c82f4]/30 hover:bg-blue-50/30 transition-all">
                  <div className="text-2xl mb-2">{item.icon}</div>
                  <p className="text-sm font-semibold text-gray-900 leading-snug mb-1">{item.label}</p>
                  <p className="text-xs text-gray-400">{item.sub}</p>
                </div>
              ))}
            </div>

            <div>
              <span className="inline-block text-[#3c82f4] text-sm font-bold uppercase tracking-widest mb-3">The Community</span>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6 leading-snug">
                He's not an outsider looking in
              </h2>
              <div className="space-y-4 text-gray-600 text-lg leading-relaxed">
                <p>
                  Tyler isn't a tech founder who spotted an opportunity in hockey. He's a hockey player who learned to code because the opportunity wasn't being taken seriously by anyone who actually understood the sport.
                </p>
                <p>
                  He's still in two leagues. He still knows his linesmen by name. He still gets the 11pm ice slot that nobody else wants. And he built Roster to solve the exact problems he deals with every single week.
                </p>
                <p>
                  That's not a marketing line. It's why Roster works.
                </p>
              </div>
              <div className="mt-8 flex flex-col sm:flex-row gap-4">
                <button
                  onClick={() => setLocation('/waitlist')}
                  className="px-7 py-3.5 rounded-full bg-[#3c82f4] text-white hover:bg-[#3c82f4]/90 transition-colors font-semibold shadow-lg shadow-blue-200"
                >
                  Join the Waitlist
                </button>
                <button
                  onClick={() => setLocation('/pricing')}
                  className="px-7 py-3.5 rounded-full border border-gray-200 text-gray-700 hover:border-[#3c82f4] hover:text-[#3c82f4] transition-colors font-semibold"
                >
                  See Pricing
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

    </MarketingLayout>
  );
}
