import { MarketingLayout } from '@/components/MarketingLayout';
import { useLocation } from 'wouter';

export default function About() {
  const [, setLocation] = useLocation();

  return (
    <MarketingLayout
      title="About Roster | Built by a Hockey Player Who Got Tired of the Chaos"
      description="Roster was built by a frustrated hockey player who was sick of managing his team through group texts and spreadsheets. Here's why he built it."
      ogTitle="About Roster — The Founder's Story"
      ogDescription="A hockey team management app built by a frustrated player, for players. Here's the story behind Roster."
    >
      <section className="py-24 px-6 bg-gradient-to-b from-blue-50/60 to-white">
        <div className="max-w-2xl mx-auto">
          {/* Founder avatar */}
          <div className="flex items-center gap-4 mb-12">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-2xl font-bold shadow-md flex-shrink-0">
              TF
            </div>
            <div>
              <p className="font-bold text-gray-900 text-lg">Tyler F.</p>
              <p className="text-gray-500 text-sm">Founder, Roster · Captain, Wednesday Night Hockey</p>
            </div>
          </div>

          {/* Story */}
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-8 leading-snug">
            I built Roster because I was <span className="text-[#3c82f4]">tired of being the captain.</span>
          </h1>

          <div className="space-y-6 text-gray-600 text-lg leading-relaxed">
            <p>
              Not tired of playing — tired of the admin that came with it. I ran a Wednesday night hockey league for four years. Every week was the same drill: chase 20 adults through a group text to see who was showing up, manually count heads, pray enough people confirmed, and still somehow end up at the rink with a half-empty ice time.
            </p>
            <p>
              I tried every app out there. TeamSnap cost a fortune and was covered in ads. BenchApp was half-finished. Spreadsheets fell apart the second someone edited the wrong row. Nothing was built for the way actual recreational teams work.
            </p>
            <p>
              The moment I decided to build something myself was a Tuesday night in February. We showed up to the rink with 8 skaters for what was supposed to be a full game. Nobody had confirmed. Nobody knew. We paid for an hour of ice and skated 4-on-4 like idiots.
            </p>

            <blockquote className="border-l-4 border-[#3c82f4] pl-5 py-1 my-8">
              <p className="text-gray-800 font-medium italic text-xl">
                "There has to be a better way to do this."
              </p>
            </blockquote>

            <p>
              So I built it. Roster started as a tool for my own team — just to get RSVPs working reliably. Then I added a substitute player system so we'd never show up short again. Then payments, scheduling, stats, messaging. One problem at a time.
            </p>
            <p>
              The app launches <strong className="text-gray-900">May 1, 2026</strong>. It's ad-free on every plan. It's priced so that a beer leaguer doesn't have to think twice about it. And it's built to handle the exact problems I spent four years fighting every Wednesday night.
            </p>
            <p className="text-gray-900 font-semibold">
              If you've ever been the captain, you know. Roster is for you.
            </p>
          </div>

          {/* CTA */}
          <div className="mt-12 flex flex-col sm:flex-row gap-4">
            <button
              onClick={() => setLocation('/waitlist')}
              className="px-8 py-4 rounded-full bg-[#3c82f4] text-white hover:bg-[#3c82f4]/90 transition-colors font-semibold text-base shadow-lg shadow-blue-200"
            >
              Join the Waitlist
            </button>
            <button
              onClick={() => setLocation('/pricing')}
              className="px-8 py-4 rounded-full border border-gray-200 text-gray-700 hover:border-[#3c82f4] hover:text-[#3c82f4] transition-colors font-semibold text-base"
            >
              See Pricing
            </button>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
