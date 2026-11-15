import { ElementType, useEffect } from 'react';
import { MarketingLayout } from '@/components/MarketingLayout';
import { Check, Calendar, MessageCircle, Trophy, Users, CreditCard, Bell } from 'lucide-react';
import { useLocation } from 'wouter';
import { FunFeaturesNudge } from '@/components/FunFeaturesShowcase';
import { APP_SITE_ORIGIN } from '@/lib/seoMetadata';

interface SportConfig {
  slug: string;
  name: string;
  emoji: string;
  tagline: string;
  headline: string;
  subheadline: string;
  description: string;
  pains: string[];
  features: { icon: ElementType; title: string; description: string }[];
  metaTitle: string;
  metaDescription: string;
  comingSoon?: boolean;
}

const sportConfigs: Record<string, SportConfig> = {
  hockey: {
    slug: 'hockey',
    name: 'Hockey',
    emoji: '🏒',
    tagline: 'Built for Hockey',
    headline: 'Built specifically for hockey teams and leagues.',
    subheadline: 'Scheduling, lineups, RSVPs, stats, and payments — built specifically for hockey teams and leagues.',
    description: 'Running a hockey team is harder than it looks. Between scheduling ice time, tracking who\'s showing up, managing subs, and handling dues — it\'s a full-time job. RosterHockey handles all of it so you can focus on the game.',
    pains: [
      'Never know how many skaters are showing up',
      'Ice time wasted because of no-shows',
      'Last-minute scramble for substitute players',
      'Chasing teammates for dues payments',
    ],
    features: [
      {
        icon: Users,
        title: 'Lineup & Roster Management',
        description: 'Build your full roster, set lines, and know exactly who\'s skating before every game. No more counting heads at the rink.',
      },
      {
        icon: Bell,
        title: 'RSVP with Auto-Reminders',
        description: 'Players confirm availability with one tap. Automatic reminders go out 2 days and 2 hours before puck drop.',
      },
      {
        icon: Calendar,
        title: 'Player Substitution System',
        description: 'Short a skater? RosterHockey\'s sub system finds and notifies available fill-ins automatically — so you never show up one man short.',
      },
      {
        icon: CreditCard,
        title: 'In-App Dues & Payments',
        description: 'Collect ice fees, handle dues, and link your Venmo or CashApp. No more awkward money conversations at the rink.',
      },
      {
        icon: Trophy,
        title: 'Stats & League Standings',
        description: 'Track goals, assists, wins, and standings across your league. Everyone knows where they stand — on and off the ice.',
      },
      {
        icon: MessageCircle,
        title: 'Team Messaging',
        description: 'Keep all team communication in one place. No more buried group texts or missed emails.',
      },
    ],
    metaTitle: 'Hockey Team Management | RosterHockey',
    metaDescription: 'Manage hockey schedules, RSVPs, rosters, stats, and payments with RosterHockey. One ad-free app for your team.',
  },
};

interface SportLandingProps {
  sport: string;
}

export default function SportLanding({ sport }: SportLandingProps) {
  const [, setLocation] = useLocation();
  const config = sportConfigs[sport];

  useEffect(() => {
    if (!config) setLocation('/');
  }, [config, setLocation]);

  if (!config) return null;

  return (
    <MarketingLayout
      title={config.metaTitle}
      description={config.metaDescription}
    >
      {/* Hero */}
      <section className="py-20 px-6 bg-gradient-to-b from-blue-50/60 to-white">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-[#3c82f4]/10 border border-[#3c82f4]/25 rounded-full px-4 py-2 mb-6">
            <span className="text-lg">{config.emoji}</span>
            <span className="text-sm font-medium text-[#3c82f4]">{config.tagline}</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold mb-6 text-gray-900 leading-tight">
            {config.headline}
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-8">
            {config.subheadline}
          </p>
          {config.comingSoon && (
            <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-full px-4 py-2 mb-6 text-sm font-semibold">
              {config.name} is not yet available. RosterHockey is available now for hockey.
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href={`${APP_SITE_ORIGIN}/get-started`}
              className="inline-flex items-center justify-center px-8 py-4 rounded-full bg-[#3c82f4] text-white hover:bg-[#3c82f4]/90 transition-colors font-semibold text-lg shadow-lg shadow-blue-200"
            >
              Get Started
            </a>
            <button
              onClick={() => setLocation('/pricing')}
              className="px-8 py-4 rounded-full border border-gray-300 hover:border-[#3c82f4] text-gray-700 hover:text-[#3c82f4] transition-colors font-semibold text-lg"
            >
              See Pricing
            </button>
          </div>
        </div>
      </section>

      {sport === 'hockey' && (
        <p className="px-6 py-4 text-center text-sm text-gray-600">
          See how <a className="font-semibold text-[#3c82f4] hover:underline" href="/line-combos-predictions">line combos and pre-game predictions</a> help your team prepare.
        </p>
      )}

      {sport === 'hockey' && (
        <div className="px-6">
          <FunFeaturesNudge />
        </div>
      )}

      {/* Problem */}
      <section className="py-16 px-6 bg-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">{config.description.split('.')[0]}.</h2>
          <p className="text-gray-600 text-lg mb-8">{config.description.split('. ').slice(1).join('. ')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {config.pains.map((pain) => (
              <div key={pain} className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-xl p-4">
                <span className="text-red-500 font-bold text-lg flex-shrink-0">✕</span>
                <span className="text-gray-700 text-sm">{pain}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-3 text-gray-900">
            Everything your {config.name.toLowerCase()} team needs.
          </h2>
          <p className="text-gray-500 text-center mb-12">One app. No ads. Free to start.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {config.features.map((f) => (
              <div key={f.title} className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all">
                <div className="w-11 h-11 rounded-xl bg-[#3c82f4]/10 border border-[#3c82f4]/20 flex items-center justify-center mb-4">
                  <f.icon className="w-5 h-5 text-[#3c82f4]" />
                </div>
                <h3 className="font-bold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing preview */}
      <section className="py-16 px-6 bg-gray-50">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4 text-gray-900">Simple, honest pricing.</h2>
          <p className="text-gray-500 mb-8">Free forever tier available. No ads on any plan.</p>
          <div className="grid grid-cols-3 gap-4 mb-8">
            {[
              { tier: 'Free', price: '$0', label: 'Forever' },
              { tier: 'Player Pro', price: '$6.49', label: '/ mo', highlight: true },
              { tier: 'Commissioner', price: '$12', label: '/ mo' },
            ].map((p) => (
              <div key={p.tier} className={`rounded-2xl p-5 border ${p.highlight ? 'bg-[#3c82f4] border-[#3c82f4] shadow-lg shadow-blue-200' : 'bg-white border-gray-200'}`}>
                <p className={`text-sm font-semibold mb-1 ${p.highlight ? 'text-blue-100' : 'text-gray-500'}`}>{p.tier}</p>
                <p className={`text-2xl font-bold ${p.highlight ? 'text-white' : 'text-gray-900'}`}>{p.price}</p>
                <p className={`text-xs ${p.highlight ? 'text-blue-200' : 'text-gray-400'}`}>{p.label}</p>
              </div>
            ))}
          </div>
          <button
            onClick={() => setLocation('/pricing')}
            className="text-[#3c82f4] font-semibold hover:underline underline-offset-4"
          >
            View full pricing details →
          </button>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 bg-gradient-to-b from-blue-50 to-white text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-bold mb-4 text-gray-900">
            Ready to get organized?
          </h2>
          <p className="text-gray-500 text-lg mb-8">
            RosterHockey for hockey is live on the App Store and Google Play. Free tier available now.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href={`${APP_SITE_ORIGIN}/get-started`}
              className="inline-flex items-center justify-center px-10 py-4 rounded-full bg-[#3c82f4] text-white hover:bg-[#3c82f4]/90 transition-colors font-semibold text-lg shadow-lg shadow-blue-200"
            >
              Get Started
            </a>
            <button
              onClick={() => setLocation('/about')}
              className="px-10 py-4 rounded-full border border-gray-200 text-gray-700 hover:border-[#3c82f4] hover:text-[#3c82f4] transition-colors font-semibold text-lg"
            >
              Our Story
            </button>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
