import { useState } from 'react';
import { MarketingLayout } from '@/components/MarketingLayout';
import { useLocation } from 'wouter';
import { Users, MessageSquare, CheckCircle } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import founderPhoto from '@assets/PXL_20210123_194151447.MP_1773953996231.jpg';

export default function About() {
  const [, setLocation] = useLocation();
  const [photoModalOpen, setPhotoModalOpen] = useState(false);

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
            <div className="flex-shrink-0 w-72 md:w-80">
              <div 
                onClick={() => setPhotoModalOpen(true)}
                className="relative aspect-[9/16] rounded-3xl overflow-hidden shadow-2xl shadow-blue-100 cursor-pointer hover:shadow-2xl hover:shadow-blue-300 transition-shadow"
              >
                <img
                  src={founderPhoto}
                  alt="Tobin K., Roster founder, on the ice"
                  className="w-full h-full object-cover object-center"
                />
              </div>
            </div>

            {/* Intro copy */}
            <div className="text-center md:text-left">
              <div className="inline-flex items-center gap-2 bg-[#3c82f4]/10 border border-[#3c82f4]/25 rounded-full px-4 py-1.5 mb-4">
                <span className="text-sm font-medium text-[#3c82f4]">Meet the founder</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4 leading-tight">
                Tobin K.
              </h1>
              <p className="text-[#3c82f4] font-semibold text-lg mb-1">Hockey Player - Lifetime Beer League Member</p>
              <p className="text-gray-600 text-lg leading-relaxed max-w-xl">I didn't set out to build a software company. I set out to build an app for the hockey community with the added benefit of never wondering if we had enough players. </p>
            </div>
          </div>
        </div>
      </section>
      {/* ── 2. PULL QUOTE & STATS ─────────────────────────────── */}
      <section className="py-20 px-6 bg-white pt-[2px] pb-[2px]">
        <div className="max-w-5xl mx-auto">
          <div className="space-y-5 max-w-2xl mx-auto">
            <div className="bg-[#3c82f4] rounded-3xl p-8 shadow-xl shadow-blue-200">
              <p className="text-white text-2xl font-semibold leading-snug mb-4">"You'd be amazed at how much admin work there is to do as Commissioner"</p>
              <p className="text-blue-200 text-sm font-medium">Brian - Tobin's league commissioner</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 border border-gray-100 rounded-2xl p-5 text-center">
                <p className="text-3xl font-black text-gray-900 mb-1">10</p>
                <p className="text-sm text-gray-500">Years with a BenchApp account before building Roster</p>
              </div>
              <div className="bg-gray-50 border border-gray-100 rounded-2xl p-5 text-center">
                <p className="text-3xl font-black text-gray-900 mb-1">4</p>
                <p className="text-sm text-gray-500">Apps he tested before deciding to build his own</p>
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* ── 3. WHY I BUILT ROSTER ─────────────────────────────── */}
      <section className="py-20 px-6 bg-white pt-[2px] pb-[2px]">
        <div className="max-w-5xl mx-auto">
          <span className="inline-block text-[#3c82f4] text-sm font-bold uppercase tracking-widest mb-3">The Origin</span>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6 leading-snug">Why I built Roster</h2>
          <div className="space-y-4 text-gray-600 text-lg leading-relaxed max-w-3xl">
            <p>
              Since 2016 we used BenchApp for the teams.  It worked well for surface level items like calendar and planning.  But as I moved into a more community-oriented league with fantastic people, I realized that we could benefit from a more personal app experience.
            </p>
            <p>
              Our league used everything.  Excel for schedules and drafts, esportsdesk for standings and player stats, team text threads. Nothing solved the actual problem: <em>having 1 app for everything... literally everything.</em>
            </p>
            <p>So while driving back to Ohio from our annual family vacation, I planned out Roster.  4 months later, some of the players had a working beta app to test. </p>
          </div>
        </div>
      </section>
      {/* ── 4. HOW HE BUILT IT RIGHT ─────────────────────────────── */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <span className="inline-block text-[#3c82f4] text-sm font-bold uppercase tracking-widest mb-3">The Process</span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              How he made sure Roster was built right
            </h2>
            <p className="text-gray-500 text-lg max-w-2xl mx-auto">
              Tobin didn't build Roster in isolation. He spent a year talking to captains, coaches, and commissioners before writing a line of code.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
            {[
              {
                icon: Users,
                number: '100+',
                label: 'Players & captains interviewed',
                description: 'Tobin sat down with beer leaguers, recreational players, and league commissioners to understand what actually went wrong every week — not what looked good in a feature list.',
              },
              {
                icon: MessageSquare,
                number: '4',
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
      {/* Photo expansion modal */}
      <Dialog open={photoModalOpen} onOpenChange={setPhotoModalOpen}>
        <DialogContent className="max-w-2xl w-full p-0 border-0">
          <img
            src={founderPhoto}
            alt="Tobin K., Roster founder, on the ice"
            className="w-full h-auto rounded-lg"
          />
        </DialogContent>
      </Dialog>
    </MarketingLayout>
  );
}
