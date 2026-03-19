import { ElementType } from 'react';
import { MarketingLayout } from '@/components/MarketingLayout';
import { Check, Calendar, MessageCircle, Trophy, Users, CreditCard, Bell, Shield } from 'lucide-react';
import { useLocation } from 'wouter';

interface SegmentConfig {
  slug: string;
  label: string;
  emoji: string;
  tagline: string;
  headline: string;
  subheadline: string;
  audience: string;
  pains: string[];
  solutions: { title: string; description: string }[];
  features: { icon: ElementType; label: string }[];
  testimonial: { quote: string; name: string; team: string; initials: string; gradient: string };
  metaTitle: string;
  metaDescription: string;
}

const segmentConfigs: Record<string, SegmentConfig> = {
  'for-youth-teams': {
    slug: 'for-youth-teams',
    label: 'Youth Teams',
    emoji: '🧒',
    tagline: 'Built for Youth Sports',
    headline: 'The simplest way to manage youth sports teams.',
    subheadline: 'Communication tools built for parents and volunteer coaches — not tech experts. Free to start.',
    audience: 'youth sports teams',
    pains: [
      'Parents messaging through 4 different apps at once',
      'Volunteer coaches spending hours on admin instead of coaching',
      'Last-minute cancellations reached too late because of buried group texts',
      'No easy way to collect fees without handling cash',
    ],
    solutions: [
      {
        title: 'Parent-friendly communication',
        description: "One app. One message. Every parent sees it immediately — no more hoping it got passed along through the team text chain.",
      },
      {
        title: 'Volunteer coach tools',
        description: "You\'re a coach, not an admin. Roster automates schedules, reminders, and RSVP tracking so you spend your energy coaching.",
      },
      {
        title: 'Safe, simple payment collection',
        description: "Collect team fees, snack money, and equipment costs digitally — no cash handling, no awkward parent conversations.",
      },
    ],
    features: [
      { icon: Bell, label: 'Automated Parent Reminders' },
      { icon: Calendar, label: 'Season Scheduling' },
      { icon: Users, label: 'Player Attendance Tracking' },
      { icon: CreditCard, label: 'Digital Fee Collection' },
      { icon: MessageCircle, label: 'Parent & Team Messaging' },
      { icon: Shield, label: 'No Ads. Kid-Friendly.' },
    ],
    testimonial: {
      quote: "I'm a volunteer coach with three kids of my own. The last thing I need is another complicated app. Roster is the first tool that actually made my life easier, not harder.",
      name: "Coach Patel",
      team: "U12 Youth Hockey",
      initials: "CP",
      gradient: "from-blue-500 to-blue-700",
    },
    metaTitle: 'Youth Sports Team Management App | Roster — Easy for Parents & Coaches',
    metaDescription: 'Roster makes managing youth sports teams simple for volunteer coaches and parents. Scheduling, RSVP reminders, player tracking, and digital fee collection — all in one app. Free to start.',
  },
  'for-adult-leagues': {
    slug: 'for-adult-leagues',
    label: 'Adult Leagues',
    emoji: '🏟️',
    tagline: 'Built for Adult Rec Leagues',
    headline: 'Finally, an app that understands adult rec sports.',
    subheadline: 'Busy schedules. Last-minute no-shows. Dues nobody wants to collect. Roster handles all of it.',
    audience: 'adult recreational leagues',
    pains: [
      'Players confirming, then bailing at the last minute',
      'No reliable way to find substitute players when someone can\'t make it',
      'Dues are always awkward to collect — some people never pay',
      'Scheduling around 20 adults\' jobs, kids, and social lives',
    ],
    solutions: [
      {
        title: 'RSVP & sub system that actually works',
        description: "Players confirm availability with one tap. If someone drops out, Roster\'s sub system finds a replacement automatically — before you even know there\'s a problem.",
      },
      {
        title: 'Dues collection without the awkwardness',
        description: "Send payment requests in the app. Track who\'s paid. Link to Venmo or CashApp. No more being the person who has to ask for money face-to-face.",
      },
      {
        title: 'Scheduling for busy adults',
        description: "One shared calendar everyone actually checks. RSVP reminders 2 days and 2 hours before game time. No surprises.",
      },
    ],
    features: [
      { icon: Users, label: 'Player Substitution System' },
      { icon: Bell, label: 'Game Day RSVP Reminders' },
      { icon: CreditCard, label: 'Dues & Fee Tracking' },
      { icon: Calendar, label: 'Season Scheduling' },
      { icon: Trophy, label: 'League Standings & Stats' },
      { icon: MessageCircle, label: 'Team Messaging' },
    ],
    testimonial: {
      quote: "I run a 6-team adult hockey league. Roster replaced my spreadsheet, our group chat, and the Venmo money-collecting nightmare. I get my Tuesday nights back.",
      name: "Derek R.",
      team: "City Adult Hockey League",
      initials: "DR",
      gradient: "from-emerald-500 to-emerald-700",
    },
    metaTitle: 'Adult Recreational League Management App | Roster — RSVP, Subs & Dues',
    metaDescription: 'Roster is built for adult rec sports leagues. RSVP tracking, automatic sub-finding, digital dues collection, league standings, and scheduling — all in one ad-free app.',
  },
  'for-varsity': {
    slug: 'for-varsity',
    label: 'Varsity & Competitive Teams',
    emoji: '🏆',
    tagline: 'Built for Competitive Play',
    headline: 'Team management built for competitive sports.',
    subheadline: 'Rosters, stats, tournaments, scorekeeping, and standings — everything a competitive team needs to stay sharp.',
    audience: 'varsity and competitive sports teams',
    pains: [
      'Manual stat tracking that\'s always behind or inaccurate',
      'Tournament brackets managed in a spreadsheet nobody can read',
      'Large rosters with no good way to manage positions, eligibility, or availability',
      'Coaching staff and players on different communication systems',
    ],
    solutions: [
      {
        title: 'Live stats and scorekeeping',
        description: "Track stats in real time. Goals, assists, penalties, win/loss records — every number updated live so players and coaches always know where they stand.",
      },
      {
        title: 'Tournament & bracket management',
        description: "Run your whole tournament from Roster. Build brackets, schedule rounds, record scores, and publish standings — all in one place.",
      },
      {
        title: 'Deep roster management',
        description: "Manage every player on your roster across multiple lines, positions, and roles. Track eligibility, availability, and performance all season long.",
      },
    ],
    features: [
      { icon: Trophy, label: 'Live Stats & Scorekeeping' },
      { icon: Calendar, label: 'Tournament Bracket Management' },
      { icon: Users, label: 'Deep Roster Management' },
      { icon: Bell, label: 'Game Day RSVP Tracking' },
      { icon: MessageCircle, label: 'Coaching Staff Messaging' },
      { icon: Shield, label: 'League-Wide Posts & Awards' },
    ],
    testimonial: {
      quote: "We run a competitive tournament series and Roster's bracket management is the only thing that's ever made sense to us. Brackets, scoring, standings — all clean and automatic.",
      name: "Aisha P.",
      team: "Regional Hockey Club",
      initials: "AP",
      gradient: "from-teal-500 to-teal-700",
    },
    metaTitle: 'Varsity & Competitive Sports Team App | Roster — Stats, Tournaments & Standings',
    metaDescription: 'Roster is built for competitive and varsity sports teams. Live stats, tournament brackets, scorekeeping, deep roster management, and standings — all in one app. Free to start.',
  },
};

interface SegmentLandingProps {
  segment: string;
}

export default function SegmentLanding({ segment }: SegmentLandingProps) {
  const [, setLocation] = useLocation();
  const config = segmentConfigs[segment];

  if (!config) {
    setLocation('/');
    return null;
  }

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
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => setLocation('/waitlist')}
              className="px-8 py-4 rounded-full bg-[#3c82f4] text-white hover:bg-[#3c82f4]/90 transition-colors font-semibold text-lg shadow-lg shadow-blue-200"
            >
              Join the Waitlist
            </button>
            <button
              onClick={() => setLocation('/pricing')}
              className="px-8 py-4 rounded-full border border-gray-300 hover:border-[#3c82f4] text-gray-700 hover:text-[#3c82f4] transition-colors font-semibold text-lg"
            >
              See Pricing
            </button>
          </div>
        </div>
      </section>

      {/* Pain points */}
      <section className="py-16 px-6 bg-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8 text-center">
            Sound familiar?
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {config.pains.map((pain) => (
              <div key={pain} className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-xl p-4">
                <span className="text-red-500 font-bold text-lg flex-shrink-0">✕</span>
                <span className="text-gray-700">{pain}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Solutions */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-3 text-gray-900">
            Roster fixes it.
          </h2>
          <p className="text-gray-500 text-center mb-12">Built specifically for {config.audience}.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {config.solutions.map((s, i) => (
              <div key={s.title} className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
                <div className="w-10 h-10 rounded-full bg-[#3c82f4] flex items-center justify-center text-white font-bold text-sm mb-4">
                  {String(i + 1).padStart(2, '0')}
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{s.title}</h3>
                <p className="text-gray-500 leading-relaxed text-sm">{s.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features list */}
      <section className="py-16 px-6 bg-white">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-bold mb-8 text-gray-900">Everything included</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {config.features.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl p-4">
                <Icon className="w-5 h-5 text-[#3c82f4] flex-shrink-0" />
                <span className="text-sm font-medium text-gray-700">{label}</span>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-4 text-sm text-gray-400">
            <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-[#3c82f4]" /> No ads ever</span>
            <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-[#3c82f4]" /> Free tier available</span>
            <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-[#3c82f4]" /> No credit card required</span>
          </div>
        </div>
      </section>

      {/* Testimonial */}
      <section className="py-16 px-6 bg-gray-50">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm">
            <div className="flex items-center gap-1 mb-4">
              {[...Array(5)].map((_, i) => (
                <span key={i} className="text-yellow-400 text-lg">★</span>
              ))}
            </div>
            <p className="text-gray-700 text-lg leading-relaxed mb-6">"{config.testimonial.quote}"</p>
            <div className="flex items-center gap-3">
              <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${config.testimonial.gradient} flex items-center justify-center text-white text-sm font-bold shadow-sm`}>
                {config.testimonial.initials}
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">{config.testimonial.name}</p>
                <p className="text-gray-400 text-xs">{config.testimonial.team}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 bg-gradient-to-b from-blue-50 to-white text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-5xl font-bold mb-4 text-gray-900">
            Ready to simplify your season?
          </h2>
          <p className="text-gray-500 text-lg mb-8">
            Launching <span className="text-gray-900 font-semibold">May 1, 2026</span>. Free tier available on day one.
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
