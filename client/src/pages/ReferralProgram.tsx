import { useState, useRef } from 'react';
import { Link } from 'wouter';
import { Check, ChevronDown, ChevronUp, ArrowRight, Upload, X, Loader2, CheckCircle, Menu } from 'lucide-react';
import rosterLightLogo from '@assets/Light_Mode_Logo_1768322748282.png';

const FAQ = [
  {
    q: 'Who is eligible to become a referral partner?',
    a: 'Any hockey association, arena, league organization, or sports media outlet with an active player community. We review each application manually to ensure quality partnerships.',
  },
  {
    q: 'How does the payout work?',
    a: 'You earn a percentage of the net subscription revenue from every player who signs up using your referral code. Payouts are made quarterly via bank transfer or check, with a minimum threshold of $25.',
  },
  {
    q: 'What counts as net revenue?',
    a: 'Net revenue is the subscription price minus the app store fee (typically 15–30% depending on the platform). Your payout is calculated on net revenue, not gross.',
  },
  {
    q: 'How do players use my referral code?',
    a: 'When players sign up for Roster, they can enter your referral code in the onboarding flow. The code links their subscription to your account automatically.',
  },
  {
    q: 'How long does approval take?',
    a: 'Most applications are reviewed within 3–5 business days. You\'ll receive an email with the decision and, if approved, your unique referral code.',
  },
  {
    q: 'Can I see who signed up using my code?',
    a: 'Yes. Your partner portal shows a full conversion history — dates, subscription tiers, and estimated earnings for each referral.',
  },
];

function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left px-5 py-4 flex items-center justify-between gap-4 hover:bg-gray-50 transition-colors"
      >
        <span className="font-semibold text-gray-900 text-sm">{q}</span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" />}
      </button>
      {open && (
        <div className="px-5 pb-4 text-sm text-gray-600 leading-relaxed border-t border-gray-100">
          <div className="pt-3">{a}</div>
        </div>
      )}
    </div>
  );
}

const ORG_TYPES = [
  'Hockey Association / Club',
  'Arena / Ice Facility',
  'Recreation League',
  'Youth Sports Organization',
  'Sports Media / Podcast',
  'Other',
];

export default function ReferralProgram() {
  const applyRef = useRef<HTMLDivElement>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [form, setForm] = useState({
    orgName: '',
    contactName: '',
    email: '',
    orgType: '',
    hockeyAffiliation: '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [submitError, setSubmitError] = useState('');

  function scrollToApply() {
    applyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const allowed = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowed.includes(f.type)) {
      setFileError('Please upload a JPEG, PNG, or PDF file.');
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setFileError('File must be under 10 MB.');
      return;
    }
    setFileError('');
    setFile(f);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.orgName || !form.contactName || !form.email || !form.orgType) return;
    setSubmitStatus('submitting');
    setSubmitError('');

    const fd = new FormData();
    fd.append('orgName', form.orgName);
    fd.append('contactName', form.contactName);
    fd.append('email', form.email.toLowerCase().trim());
    fd.append('orgType', form.orgType);
    if (form.hockeyAffiliation) fd.append('hockeyAffiliation', form.hockeyAffiliation);
    if (file) fd.append('proofDocument', file);

    try {
      const res = await fetch('/api/referral/apply', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.message || 'Something went wrong. Please try again.');
        setSubmitStatus('error');
      } else {
        setSubmitStatus('success');
      }
    } catch {
      setSubmitError('Network error. Please check your connection and try again.');
      setSubmitStatus('error');
    }
  }

  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Nav */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-xl border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <Link href="/">
            <img src={rosterLightLogo} alt="Roster" className="h-8 object-contain cursor-pointer" />
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm">
            <a href="#how-it-works" className="text-gray-500 hover:text-gray-900 transition-colors">How It Works</a>
            <a href="#payouts" className="text-gray-500 hover:text-gray-900 transition-colors">Payouts</a>
            <a href="#faq" className="text-gray-500 hover:text-gray-900 transition-colors">FAQ</a>
            <Link href="/referral-program/portal/login" className="text-gray-500 hover:text-gray-900 transition-colors">Partner Login</Link>
          </nav>
          <div className="flex items-center gap-3">
            <button
              onClick={scrollToApply}
              className="hidden md:inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#3c82f4] text-white text-sm font-semibold hover:bg-[#3c82f4]/90 transition-colors"
            >
              Apply Now <ArrowRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setMobileMenuOpen(o => !o)}
              className="md:hidden p-2 text-gray-600"
            >
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-gray-200 bg-white px-6 py-4 space-y-3 text-sm">
            <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)} className="block text-gray-600">How It Works</a>
            <a href="#payouts" onClick={() => setMobileMenuOpen(false)} className="block text-gray-600">Payouts</a>
            <a href="#faq" onClick={() => setMobileMenuOpen(false)} className="block text-gray-600">FAQ</a>
            <Link href="/referral-program/portal/login" className="block text-gray-600">Partner Login</Link>
            <button onClick={() => { setMobileMenuOpen(false); scrollToApply(); }} className="w-full py-2 rounded-full bg-[#3c82f4] text-white font-semibold">Apply Now</button>
          </div>
        )}
      </header>
      {/* Hero */}
      <section className="py-20 px-6 bg-gradient-to-b from-blue-50/60 to-white text-center">
        <div className="max-w-3xl mx-auto">
          <span className="inline-flex items-center gap-2 bg-[#3c82f4]/10 text-[#3c82f4] text-sm font-semibold px-4 py-1.5 rounded-full mb-6">
            🤝 Partner Program
          </span>
          <h1 className="text-4xl md:text-6xl font-black text-gray-900 leading-tight mb-5">
            Roster gives back
            <br />
            <span className="text-[#3c82f4]">to our community.</span>
          </h1>
          <p className="text-lg md:text-xl text-gray-600 max-w-2xl mx-auto mb-8">
            Refer players to our platform and Roster will donate 10% of our net subscription proceeds every quarter for every active subscription tied to your organization's code.
            <br /><br />
            No selling required — just share the app you already use.
            <br /><br />
            <span className="text-[#3c82f4]">Choose a good cause and track your referrals!</span>
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={scrollToApply}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-[#3c82f4] text-white text-lg font-semibold hover:bg-[#3c82f4]/90 transition-colors shadow-lg shadow-blue-200"
            >
              Apply to Become a Partner <ArrowRight className="w-5 h-5" />
            </button>
            <Link
              href="/referral-program/portal/login"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full border border-gray-300 text-gray-700 text-lg font-semibold hover:border-gray-400 transition-colors"
            >
              Partner Login
            </Link>
          </div>
        </div>
      </section>
      {/* How it works */}
      <section className="py-20 px-6 bg-white" id="how-it-works">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-5xl font-bold text-gray-900 mb-3">How It Works</h2>
            <p className="text-gray-500 text-lg">Three simple steps to start earning.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                title: 'Apply',
                desc: 'Fill out a short application telling us about your organization. We review it within 3–5 business days.',
              },
              {
                step: '02',
                title: 'Get Your Code',
                desc: 'Once approved, you receive a unique referral code and access to your partner portal.',
              },
              {
                step: '03',
                title: 'Earn',
                desc: 'Every player who subscribes using your code earns you a percentage of their monthly subscription — paid quarterly.',
              },
            ].map(item => (
              <div key={item.step} className="relative bg-white border border-gray-200 rounded-2xl p-7 shadow-sm hover:border-[#3c82f4]/40 hover:shadow-md transition-all">
                <span className="text-5xl font-black text-gray-100 leading-none">{item.step}</span>
                <h3 className="text-xl font-bold text-gray-900 mt-2 mb-2">{item.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      {/* Benefits */}
      <section className="py-20 px-6 bg-gray-50">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">Why Partner With Roster?</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { title: 'Passive recurring income', desc: 'Earn every month a referred subscriber stays active — not just on first purchase.' },
              { title: 'No sales required', desc: 'Share an app your players actually want. No cold calls, no quotas, no pressure.' },
              { title: 'Full visibility', desc: 'Your partner portal shows every conversion, your referral code, payout estimates, and history.' },
              { title: 'Built for hockey', desc: 'Roster is the all-in-one platform your players are already asking for. Your code just makes it official.' },
              { title: 'Quarterly payouts', desc: 'Payments go out every quarter via bank transfer. Minimum $25 threshold.' },
              { title: 'Zero cost to join', desc: 'Applying and participating is completely free. We pay you, not the other way around.' },
            ].map(b => (
              <div key={b.title} className="flex items-start gap-4 bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Check className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm mb-0.5">{b.title}</p>
                  <p className="text-gray-500 text-sm">{b.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      {/* Payout structure */}
      <section className="py-20 px-6 bg-white" id="payouts">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">Payout Structure</h2>
          <p className="text-gray-500 text-lg mb-10 max-w-2xl mx-auto">
            Your payout is a percentage of the net subscription revenue — that's the subscription price after app store fees are deducted.
          </p>
          <div className="bg-gradient-to-br from-[#3c82f4]/5 to-blue-50 border border-[#3c82f4]/20 rounded-2xl p-8 text-left mb-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
              <div>
                <p className="text-4xl font-black text-[#3c82f4] mb-1">~85%</p>
                <p className="text-sm text-gray-600 font-medium">Net revenue after app store fee</p>
              </div>
              <div className="flex items-center justify-center text-3xl text-gray-300 font-light">×</div>
              <div>
                <p className="text-4xl font-black text-[#3c82f4] mb-1">Your rate</p>
                <p className="text-sm text-gray-600 font-medium">Set during your approval</p>
              </div>
            </div>
            <div className="mt-6 pt-6 border-t border-[#3c82f4]/10 text-sm text-gray-500">
              <p className="mb-1"><span className="font-semibold text-gray-700">Example:</span> A player subscribes to Player Pro at $6.49/month. After a 30% app store fee, net = ~$4.54. At a 15% payout rate, you'd earn ~$0.68/month per active subscriber.</p>
              <p className="text-xs text-gray-400 mt-2 italic">Actual payout rates are confirmed during approval and visible in your partner portal.</p>
            </div>
          </div>
        </div>
      </section>
      {/* FAQ */}
      <section className="py-20 px-6 bg-gray-50" id="faq">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">Frequently Asked Questions</h2>
          </div>
          <div className="space-y-3">
            {FAQ.map(item => <FAQItem key={item.q} {...item} />)}
          </div>
        </div>
      </section>
      {/* Application Form */}
      <section className="py-20 px-6 bg-white" id="apply" ref={applyRef}>
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">Apply to Become a Partner</h2>
            <p className="text-gray-500 text-lg">Takes about 3 minutes. We review every application personally.</p>
          </div>

          {submitStatus === 'success' ? (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-10 text-center">
              <CheckCircle className="w-14 h-14 text-green-500 mx-auto mb-5" />
              <h3 className="text-2xl font-bold text-gray-900 mb-3">Application submitted!</h3>
              <p className="text-gray-600 mb-5 max-w-sm mx-auto">
                We'll review it and get back to you at <span className="font-semibold">{form.email}</span> within 3–5 business days.
              </p>
              <p className="text-sm text-gray-400">
                Already approved?{' '}
                <Link href="/referral-program/portal/login" className="text-[#3c82f4] hover:underline">Sign in to your portal</Link>
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm space-y-5">
              {/* Org name */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Organization Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.orgName}
                  onChange={e => setForm(f => ({ ...f, orgName: e.target.value }))}
                  placeholder="Greater Cleveland Hockey Association"
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#3c82f4]/30 focus:border-[#3c82f4] transition-colors"
                />
              </div>

              {/* Contact name */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Contact Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={form.contactName}
                  onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))}
                  placeholder="Jane Smith"
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#3c82f4]/30 focus:border-[#3c82f4] transition-colors"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Email Address <span className="text-red-500">*</span></label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="jane@yourassociation.org"
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#3c82f4]/30 focus:border-[#3c82f4] transition-colors"
                />
                <p className="text-xs text-gray-400 mt-1">This will be your login email for the partner portal.</p>
              </div>

              {/* Org type */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Organization Type <span className="text-red-500">*</span></label>
                <select
                  value={form.orgType}
                  onChange={e => setForm(f => ({ ...f, orgType: e.target.value }))}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#3c82f4]/30 focus:border-[#3c82f4] transition-colors bg-white"
                >
                  <option value="">Select a type…</option>
                  {ORG_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* Hockey affiliation */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Tell us about your hockey involvement <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={form.hockeyAffiliation}
                  onChange={e => setForm(f => ({ ...f, hockeyAffiliation: e.target.value }))}
                  placeholder="e.g. We run 6 adult recreational leagues across northeast Ohio with ~800 players…"
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#3c82f4]/30 focus:border-[#3c82f4] transition-colors resize-none"
                />
              </div>

              {/* File upload */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Proof Document <span className="text-gray-400 font-normal">(optional — helps us approve faster)</span>
                </label>
                <p className="text-xs text-gray-400 mb-2">Letterhead, website screenshot, or other org verification. JPEG, PNG, or PDF. Max 10 MB.</p>
                {file ? (
                  <div className="flex items-center gap-3 px-4 py-3 border border-gray-200 rounded-xl bg-gray-50">
                    <span className="text-sm text-gray-700 flex-1 truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 px-4 py-4 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:border-[#3c82f4] hover:bg-blue-50/50 transition-colors">
                    <Upload className="w-5 h-5 text-gray-400" />
                    <span className="text-sm text-gray-500">Click to upload a document</span>
                    <input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={handleFile} className="sr-only" />
                  </label>
                )}
                {fileError && <p className="text-xs text-red-500 mt-1">{fileError}</p>}
              </div>

              {submitStatus === 'error' && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                  {submitError}
                </div>
              )}

              <button
                type="submit"
                disabled={submitStatus === 'submitting' || !form.orgName || !form.contactName || !form.email || !form.orgType}
                className="w-full py-4 rounded-xl bg-[#3c82f4] text-white font-bold text-base hover:bg-[#3c82f4]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitStatus === 'submitting' ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>
                ) : (
                  'Submit Application'
                )}
              </button>

              <p className="text-xs text-center text-gray-400">
                By applying you agree to our{' '}
                <Link href="/terms-of-service" className="text-[#3c82f4] hover:underline">Terms of Service</Link>.
                {' '}We'll never share your information.
              </p>
            </form>
          )}
        </div>
      </section>
      {/* Final CTA */}
      <section className="py-20 px-6 bg-gradient-to-b from-blue-50 to-white text-center">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Ready to grow hockey <span className="text-[#3c82f4]">and earn?</span>
          </h2>
          <p className="text-gray-500 text-lg mb-8">Apply today — it's free, it's simple, and your players already want Roster.</p>
          <button
            onClick={scrollToApply}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-[#3c82f4] text-white text-lg font-semibold hover:bg-[#3c82f4]/90 transition-colors shadow-lg shadow-blue-200"
          >
            Apply Now <ArrowRight className="w-5 h-5" />
          </button>
        </div>
      </section>
      {/* Footer */}
      <footer className="border-t border-gray-200 py-8 px-6 bg-white">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-400">
          <img src={rosterLightLogo} alt="Roster" className="h-6 object-contain" />
          <div className="flex gap-4">
            <Link href="/" className="hover:text-gray-900 transition-colors">Home</Link>
            <Link href="/pricing" className="hover:text-gray-900 transition-colors">Pricing</Link>
            <Link href="/privacy-policy" className="hover:text-gray-900 transition-colors">Privacy</Link>
            <Link href="/terms-of-service" className="hover:text-gray-900 transition-colors">Terms</Link>
          </div>
          <p>© 2025 Roster. No ads. Ever.</p>
        </div>
      </footer>
    </div>
  );
}
