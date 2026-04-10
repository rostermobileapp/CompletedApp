import { Check, Shield, Zap, X } from 'lucide-react';
import { useState } from 'react';
import { useLocation, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { SiAppstore, SiGoogleplay } from 'react-icons/si';
import { useSeo } from '@/hooks/useSeo';
import rosterLightLogo from "@assets/Light_Mode_Logo_1768322748282.png";

const featureRows = [
  { label: "Annoying Ads", free: "never", pro: "never", comm: "never", special: "ads" },
  // Free tier
  { label: "Team Schedule", free: true, pro: true, comm: true },
  { label: "In App RSVP", free: true, pro: true, comm: true },
  { label: "In App Messaging", free: true, pro: true, comm: true, freeNote: "Team Chat Only" },
  { label: "Facility Event Calendar", free: true, pro: true, comm: true },
  { label: "Website Portal", free: true, pro: true, comm: true },
  { label: "Team Stats", free: true, pro: true, comm: true },
  { label: "Standings", free: true, pro: true, comm: true },
  // Player Pro tier
  { label: "Create Team Events/Games", free: false, pro: true, comm: true },
  { label: "Roster Management", free: false, pro: true, comm: true },
  { label: "Player/Attendance Tracking", free: false, pro: true, comm: true },
  { label: "Intelligent Sub Request Tool", free: false, pro: true, comm: true },
  { label: "Polls/Bulletins", free: false, pro: true, comm: true },
  { label: "Fee & Payment Tracking", free: false, pro: true, comm: true },
  { label: "Links to Venmo/CashApp", free: false, pro: true, comm: true },
  { label: "Team Expense Tracking", free: false, pro: true, comm: true },
  { label: "Multi-Team/Org Management", free: false, pro: true, comm: true },
  { label: "Registration Notices", free: false, pro: true, comm: true },
  { label: "Volunteer/Role Assignment", free: false, pro: true, comm: true },
  { label: "League Stats", free: false, pro: true, comm: true },
  // Commissioner tier
  { label: "A-Z League Management", free: false, pro: false, comm: true },
  { label: "Bracket Generation Tool", free: false, pro: false, comm: true },
  { label: "In-Game Scorekeeping", free: false, pro: false, comm: true },
  { label: "League Drafts", free: false, pro: false, comm: true },
  { label: "3 Stars of the Game", free: false, pro: false, comm: true },
  { label: "Custom Awards", free: false, pro: false, comm: true },
  { label: "Tournaments Mode", free: false, pro: false, comm: true },
];

type CellValue = boolean | string;

function Cell({ val, highlight }: { val: CellValue; highlight?: boolean }) {
  if (val === "never") {
    return <span className="font-bold text-[#3c82f4]">NEVER</span>;
  }
  if (val === "multiple") {
    return <span className="font-semibold text-red-500">MULTIPLE</span>;
  }
  if (val === "soon") {
    return <span className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">Coming soon</span>;
  }
  if (val === "team only") {
    return <span className="text-xs font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5">Team only</span>;
  }
  if (typeof val === "string") {
    return <span className={`font-semibold ${highlight ? 'text-[#3c82f4]' : 'text-gray-700'}`}>{val}</span>;
  }
  if (val === true) {
    return <Check className={`w-5 h-5 inline ${highlight ? 'text-[#3c82f4]' : 'text-green-600'}`} />;
  }
  return <X className="w-4 h-4 inline text-gray-300" />;
}

type StripePriceEntry = { id: string; amount: number | null; currency: string | null };
type StripePricesResponse = {
  player_pro_monthly?: StripePriceEntry;
  commissioner_monthly?: StripePriceEntry;
  player_pro_yearly?: StripePriceEntry;
  commissioner_yearly?: StripePriceEntry;
};

export default function Pricing() {
  const [, setLocation] = useLocation();
  const [annual, setAnnual] = useState(false);

  useSeo({
    title: 'Pricing | Roster — Free, Pro & Commissioner Plans',
    description: 'Roster is free to start. Upgrade to Player Pro for sub requests and payment tracking, or Commissioner for full league management. No ads on any plan.',
    ogTitle: 'Roster Pricing — Free, Pro & Commissioner Plans',
    ogDescription: 'Start free. Upgrade when you need more. No ads on any plan.',
  });

  const { data: stripePrices } = useQuery<StripePricesResponse>({
    queryKey: ['/api/stripe/prices'],
  });

  const proMonthlyAmount = stripePrices?.player_pro_monthly?.amount ?? null;
  const commMonthlyAmount = stripePrices?.commissioner_monthly?.amount ?? null;
  const proYearlyAmount = stripePrices?.player_pro_yearly?.amount ?? null;
  const commYearlyAmount = stripePrices?.commissioner_yearly?.amount ?? null;

  const formatAmountNoSign = (amount: number | null) =>
    amount !== null ? (amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)) : '...';

  const formatAmountWithSign = (amount: number | null) =>
    amount !== null ? `$${formatAmountNoSign(amount)}` : '...';

  const proMonthlyDisplay = formatAmountWithSign(proMonthlyAmount);
  const commMonthlyDisplay = formatAmountWithSign(commMonthlyAmount);

  const proYearlyMonthly = proYearlyAmount !== null ? proYearlyAmount / 12 : null;
  const commYearlyMonthly = commYearlyAmount !== null ? commYearlyAmount / 12 : null;

  const proPrice = annual && proYearlyMonthly !== null
    ? proYearlyMonthly.toFixed(2)
    : formatAmountNoSign(proMonthlyAmount);
  const commPrice = annual && commYearlyMonthly !== null
    ? commYearlyMonthly.toFixed(2)
    : formatAmountNoSign(commMonthlyAmount);

  const proAnnualLabel = proYearlyAmount !== null ? `$${proYearlyAmount.toFixed(0)}/yr` : null;
  const commAnnualLabel = commYearlyAmount !== null ? `$${commYearlyAmount.toFixed(0)}/yr` : null;

  const priceRow = {
    label: "Price (Monthly)",
    free: "$0",
    pro: proMonthlyAmount !== null ? `${proMonthlyDisplay}/mo` : '...',
    comm: commMonthlyAmount !== null ? `${commMonthlyDisplay}/mo` : '...',
  };

  const allFeatureRows = [priceRow, ...featureRows];

  return (
    <div className="min-h-screen bg-white text-gray-900" data-testid="pricing-page">
      {/* Launch banner */}
      <div className="fixed top-0 left-0 right-0 z-[60] bg-[#3c82f4] text-white text-center py-2.5 px-4 text-sm font-semibold tracking-wide">
        🚀 Launching May 1, 2026 — <button onClick={() => setLocation('/waitlist')} className="underline underline-offset-2 hover:no-underline font-bold">Join the waitlist for early access</button>
      </div>

      {/* Header */}
      <header className="fixed top-10 left-0 right-0 z-50 bg-white/90 backdrop-blur-xl border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <nav className="hidden md:flex items-center gap-6">
            <Link href="/#how-it-works" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">How It Works</Link>
            <Link href="/#features" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">Features</Link>
            <Link href="/pricing" className="text-sm text-[#3c82f4] font-semibold transition-colors">Pricing</Link>
          </nav>
          <Link href="/">
            <img src={rosterLightLogo} alt="Roster" className="h-10 object-contain cursor-pointer" />
          </Link>
          <div className="flex items-center gap-3">
            <button
              className="hidden md:block text-sm text-gray-400 cursor-not-allowed font-medium"
              title="Come back May 1st"
            >
              Log In
            </button>
            <button
              onClick={() => setLocation('/waitlist')}
              className="px-5 py-2 rounded-full bg-[#3c82f4] text-white hover:bg-[#3c82f4]/90 transition-colors font-semibold text-sm"
            >
              Join the Waitlist
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="pt-36 pb-10 px-6 text-center bg-gradient-to-b from-blue-50/60 to-white">
        <h1 className="text-4xl md:text-6xl font-bold mb-4 text-gray-900">
          Simple pricing.
          <br />
          <span className="text-[#3c82f4]">No surprises.</span>
        </h1>
        <p className="text-gray-500 text-xl max-w-2xl mx-auto mb-3">
          Free to start. No credit card required. No ads on any plan — ever.
        </p>
        <p className="text-gray-400 text-sm">Launching May 1, 2026 · Join the waitlist for early access</p>
      </section>

      {/* Billing toggle */}
      <section className="py-6 px-6 bg-white">
        <div className="flex justify-center items-center gap-4">
          <span className={`text-sm font-semibold ${!annual ? 'text-gray-900' : 'text-gray-400'}`}>Monthly</span>
          <button
            onClick={() => setAnnual(!annual)}
            className={`relative w-14 h-7 rounded-full transition-colors ${annual ? 'bg-[#3c82f4]' : 'bg-gray-200'}`}
            aria-label="Toggle annual billing"
          >
            <span
              className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${annual ? 'translate-x-7' : 'translate-x-0'}`}
            />
          </button>
          <span className={`text-sm font-semibold ${annual ? 'text-gray-900' : 'text-gray-400'}`}>
            Annual
            <span className="ml-2 inline-block bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">Save up to 24%</span>
          </span>
        </div>
        {annual && (
          <p className="text-center text-xs text-gray-400 mt-2">Billed annually · Annual Stripe price IDs coming soon</p>
        )}
      </section>

      {/* Trust strip */}
      <div className="px-6 pb-6">
        <div className="max-w-3xl mx-auto flex flex-wrap justify-center gap-6">
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
      </div>

      {/* Pricing cards */}
      <section className="py-8 px-6 bg-white">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">

          {/* Free */}
          <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm flex flex-col" data-testid="card-pricing-free">
            <h3 className="text-2xl font-bold mb-1 text-gray-900">Free</h3>
            <p className="text-gray-400 text-sm mb-6">Perfect for players joining their first team.</p>
            <div className="mb-6">
              <span className="text-5xl font-bold text-gray-900">$0</span>
              <span className="text-gray-400"> / forever</span>
            </div>
            <ul className="space-y-3 mb-8 flex-1">
              {['Team Schedule', 'In App RSVP', 'In App Messaging (Team Chat)', 'Facility Event Calendar', 'Website Portal', 'Team Stats', 'Standings'].map((f) => (
                <li key={f} className="flex items-start gap-3">
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
          <div className="bg-[#3c82f4] rounded-3xl p-8 border-2 border-[#3c82f4] relative shadow-xl shadow-blue-200 flex flex-col" data-testid="card-pricing-player-pro">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs font-bold px-4 py-1.5 rounded-full whitespace-nowrap">
              MOST POPULAR
            </div>
            <h3 className="text-2xl font-bold mb-1 text-white">Player Pro</h3>
            <p className="text-blue-100 text-sm mb-6">For serious players who want the full experience.</p>
            <div className="mb-1">
              <span className="text-5xl font-bold text-white">${proPrice}</span>
              <span className="text-blue-200"> / mo</span>
            </div>
            {annual && (
              <div className="mb-4">
                <span className="text-blue-200 text-sm">
                  Billed annually{proAnnualLabel ? ` (${proAnnualLabel})` : ''}
                </span>
                <span className="ml-2 inline-block bg-white/20 text-white text-xs font-bold px-2 py-0.5 rounded-full">Save 17%</span>
              </div>
            )}
            {!annual && <div className="mb-4" />}
            <ul className="space-y-3 mb-8 flex-1">
              {['FREE +', 'Create Team Events/Games', 'Roster Management', 'Player/Attendance Tracking', 'Intelligent Sub Request Tool', 'Polls/Bulletins', 'Fee & Payment Tracking', 'Links to Venmo/CashApp', 'Team Expense Tracking', 'Multi-Team/Org Management', 'Registration Notices', 'Volunteer/Role Assignment', 'League Stats'].map((f) => (
                <li key={f} className="flex items-start gap-3">
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
          <div className="bg-white rounded-3xl p-8 border border-gray-200 shadow-sm flex flex-col" data-testid="card-pricing-commissioner">
            <h3 className="text-2xl font-bold mb-1 text-gray-900">Commissioner</h3>
            <p className="text-gray-400 text-sm mb-6">Run a full league with schedules, scores, standings, and tournaments.</p>
            <div className="mb-1">
              <span className="text-5xl font-bold text-gray-900">${commPrice}</span>
              <span className="text-gray-400"> / mo</span>
            </div>
            {annual && (
              <div className="mb-4">
                <span className="text-gray-400 text-sm">
                  Billed annually{commAnnualLabel ? ` (${commAnnualLabel})` : ''}
                </span>
                <span className="ml-2 inline-block bg-green-100 text-green-700 text-xs font-bold px-2 py-0.5 rounded-full">Save 24%</span>
              </div>
            )}
            {!annual && <div className="mb-4" />}
            <ul className="space-y-3 mb-8 flex-1">
              {['FREE & PLAYER PRO +', 'A-Z League Management', 'Bracket Generation Tool', 'In-Game Scorekeeping', 'League Drafts', '3 Stars of the Game', 'Custom Awards', 'Tournaments Mode'].map((f) => (
                <li key={f} className="flex items-start gap-3">
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
      </section>

      {/* Feature comparison table */}
      <section className="py-16 px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-3 text-gray-900">
            See every feature, side by side.
          </h2>
          <p className="text-gray-500 text-center mb-10">Every feature, across every plan — side by side.</p>

          <div className="overflow-x-auto rounded-2xl border border-gray-200 shadow-sm">
            <table className="w-full border-collapse bg-white text-sm" data-testid="pricing-comparison-table">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left p-4 font-bold text-gray-900 w-[30%]">Feature</th>
                  <th className="text-center p-4 font-semibold text-gray-600 w-[23%]">Free</th>
                  <th className="text-center p-4 font-bold bg-[#3c82f4]/8 text-gray-900 border-x border-[#3c82f4]/20 w-[23%]">
                    <div className="flex flex-col items-center gap-1">
                      <span>Player Pro</span>
                      <span className="text-[10px] font-normal text-[#3c82f4] bg-[#3c82f4]/10 rounded-full px-2 py-0.5">Best Value</span>
                    </div>
                  </th>
                  <th className="text-center p-4 font-semibold text-gray-700 w-[24%]">Commissioner</th>
                </tr>
              </thead>
              <tbody>
                {allFeatureRows.map(({ label, free, pro, comm, freeNote }: any) => (
                  <tr key={label} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50 transition-colors">
                    <td className="p-4 text-gray-800 font-medium">{label}</td>
                    <td className="text-center p-4 text-gray-600">
                      <Cell val={free as CellValue} />
                      {freeNote && <div className="text-[10px] text-gray-400 mt-1">{freeNote}</div>}
                    </td>
                    <td className="text-center p-4 bg-[#3c82f4]/5 border-x border-[#3c82f4]/10"><Cell val={pro as CellValue} highlight /></td>
                    <td className="text-center p-4 text-gray-600"><Cell val={comm as CellValue} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-6 bg-gradient-to-b from-blue-50 to-white">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-5xl font-bold mb-4 text-gray-900">
            Ready for your<br /><span className="text-[#3c82f4]">best season yet?</span>
          </h2>
          <p className="text-gray-500 mb-3 text-lg">
            We launch <span className="text-gray-900 font-semibold">May 1, 2026</span>. Free forever tier on day one.
          </p>
          <p className="text-gray-400 text-sm mb-8">No credit card required · No ads on any plan</p>
          <button
            onClick={() => setLocation('/waitlist')}
            className="px-10 py-4 rounded-full bg-[#3c82f4] text-white hover:bg-[#3c82f4]/90 transition-colors font-semibold text-lg shadow-lg shadow-blue-200 mb-8"
          >
            Join the Waitlist
          </button>
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
      <footer className="border-t border-gray-200 py-10 px-6 bg-white">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <p className="text-sm text-gray-400">© 2025 Roster. Built for teams, by team players. No ads. Ever.</p>
          <div className="flex items-center gap-6">
            <Link href="/pricing" className="text-sm text-[#3c82f4] font-medium">Pricing</Link>
            <Link href="/privacy-policy" className="text-sm text-gray-400 hover:text-gray-900 transition-colors">Privacy Policy</Link>
            <Link href="/terms-of-service" className="text-sm text-gray-400 hover:text-gray-900 transition-colors">Terms of Service</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
