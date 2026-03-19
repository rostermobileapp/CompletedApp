import { MarketingLayout } from '@/components/MarketingLayout';
import { Check, Heart, Shield, Users, Zap } from 'lucide-react';
import { useLocation } from 'wouter';

const values = [
  {
    icon: Shield,
    title: 'No Ads. Ever.',
    description: "We'll never sell your attention. No banners, no sponsored posts, no tracking pixels. You paid (or didn't) — that's the deal.",
  },
  {
    icon: Users,
    title: 'Players First',
    description: 'Every feature starts with one question: does this make life easier for the players and organizers using it?',
  },
  {
    icon: Zap,
    title: 'Simple by Design',
    description: 'Sports management tools are way too complicated. We strip out everything you don\'t need and make the stuff you do need feel effortless.',
  },
  {
    icon: Heart,
    title: 'Built by Frustrated Players',
    description: "We didn't build Roster as a business idea. We built it because we were tired of the chaos — and realized everyone else was too.",
  },
];

export default function About() {
  const [, setLocation] = useLocation();

  return (
    <MarketingLayout
      title="About Roster | Built by Hockey Players, for Hockey Players"
      description="Roster was built by frustrated hockey players who were tired of managing teams through group texts and spreadsheets. Learn about our story, mission, and why we built a no-ads team management app."
      ogTitle="About Roster — Our Story"
      ogDescription="A team management app born on the ice. Learn about why we built Roster and the mission behind it."
    >
      {/* Hero */}
      <section className="py-20 px-6 bg-gradient-to-b from-blue-50/60 to-white text-center">
        <div className="max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-[#3c82f4]/10 border border-[#3c82f4]/25 rounded-full px-4 py-2 mb-6">
            <span className="text-sm font-medium text-[#3c82f4]">Our Story</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold mb-6 text-gray-900 leading-tight">
            Built by frustrated players.
            <br />
            <span className="text-[#3c82f4]">For all players.</span>
          </h1>
          <p className="text-xl text-gray-600 leading-relaxed">
            It started with a Sunday night hockey league, a group chat that nobody could keep up with, and one too many half-empty ice times because someone "thought someone else was handling it."
          </p>
        </div>
      </section>

      {/* Founder Story */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-start">
            <div>
              <h2 className="text-3xl font-bold mb-6 text-gray-900">Why we built Roster</h2>
              <div className="space-y-4 text-gray-600 leading-relaxed text-lg">
                <p>
                  We were players. We were captains. We were the poor souls who somehow ended up responsible for scheduling 20 adults who couldn't agree on a game night.
                </p>
                <p>
                  We tried every app out there. TeamSnap was expensive and bloated with ads. BenchApp felt unfinished. Group texts turned into 200-message chaos. Spreadsheets broke the moment someone edited the wrong cell.
                </p>
                <p>
                  So we built the app we actually wanted to use. Simple, fast, and ad-free — because nobody playing recreational hockey at 11pm should be staring at banner ads.
                </p>
                <p>
                  Roster handles the boring stuff — scheduling, RSVPs, lineups, stats, payments — so you can focus on the actual game.
                </p>
              </div>
            </div>
            <div className="space-y-4">
              {/* Story card */}
              <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6">
                <p className="text-gray-700 italic text-lg leading-relaxed mb-4">
                  "We showed up to the rink with 8 skaters for a 4v4 game because no one confirmed who was coming. That was the last time."
                </p>
                <p className="text-sm font-semibold text-gray-900">— The moment Roster was born</p>
              </div>
              {/* What we ship */}
              <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
                <p className="font-semibold text-gray-900 mb-4">What we shipped May 1, 2026:</p>
                <ul className="space-y-2">
                  {[
                    'Team & league scheduling',
                    'RSVP with automatic reminders',
                    'Player substitution system',
                    'In-app messaging & payments',
                    'Stats, standings & tournaments',
                    'Zero ads. On every plan.',
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-3">
                      <Check className="w-4 h-4 text-[#3c82f4] flex-shrink-0" />
                      <span className="text-sm text-gray-700">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Mission Statement */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6 text-gray-900">Our mission</h2>
          <p className="text-2xl md:text-3xl font-semibold text-gray-700 leading-relaxed mb-6">
            "Give every sports team — from Sunday beer league to competitive varsity — the same quality tools the pros have. Simple, affordable, and ad-free."
          </p>
          <p className="text-gray-500 text-lg">
            We believe managing a team shouldn't require a full-time admin. It should take five minutes. Then you get back to playing.
          </p>
        </div>
      </section>

      {/* Values */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12 text-gray-900">What we stand for</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {values.map((v) => (
              <div key={v.title} className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm hover:shadow-md transition-all">
                <div className="w-12 h-12 rounded-xl bg-[#3c82f4]/10 border border-[#3c82f4]/20 flex items-center justify-center mb-4">
                  <v.icon className="w-6 h-6 text-[#3c82f4]" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">{v.title}</h3>
                <p className="text-gray-500 leading-relaxed">{v.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team placeholder */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4 text-gray-900">The team behind Roster</h2>
          <p className="text-gray-500 mb-10">We're a small, scrappy team of players, coaches, and developers who actually use this app every week.</p>
          <div className="flex flex-wrap justify-center gap-6">
            {[
              { initials: 'TF', name: 'Tyler F.', role: 'Founder & Captain', gradient: 'from-blue-500 to-blue-700' },
              { initials: 'KR', name: 'Kira R.', role: 'Product & Design', gradient: 'from-purple-500 to-purple-700' },
              { initials: 'DM', name: 'Dan M.', role: 'Engineering', gradient: 'from-emerald-500 to-emerald-700' },
              { initials: 'AL', name: 'Alex L.', role: 'Engineering', gradient: 'from-orange-500 to-orange-700' },
            ].map((m) => (
              <div key={m.initials} className="flex flex-col items-center gap-3">
                <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${m.gradient} flex items-center justify-center text-white text-2xl font-bold shadow-md ring-4 ring-white`}>
                  {m.initials}
                </div>
                <div className="text-center">
                  <p className="font-semibold text-gray-900">{m.name}</p>
                  <p className="text-sm text-gray-400">{m.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 bg-gradient-to-b from-blue-50 to-white text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-bold mb-4 text-gray-900">
            Ready to join us?
          </h2>
          <p className="text-gray-500 text-lg mb-8">
            We launch <span className="text-gray-900 font-semibold">May 1, 2026</span>. Join the waitlist and be first on the ice.
          </p>
          <button
            onClick={() => setLocation('/waitlist')}
            className="px-10 py-4 rounded-full bg-[#3c82f4] text-white hover:bg-[#3c82f4]/90 transition-colors font-semibold text-lg shadow-lg shadow-blue-200"
          >
            Join the Waitlist
          </button>
        </div>
      </section>
    </MarketingLayout>
  );
}
