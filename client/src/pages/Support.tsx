import { MarketingLayout } from '@/components/MarketingLayout';
import { Mail, MessageCircle, Bug, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

const faqs = [
  {
    question: 'How do I create a team or league?',
    answer:
      'After signing up and completing onboarding, tap the "+" button on the dashboard. You can choose to create a new team or a new league. Follow the setup wizard to add your sport, schedule, and invite players.',
  },
  {
    question: 'How do players RSVP to games?',
    answer:
      'Players receive a push notification and in-app alert when a new game is scheduled. They can tap "Going", "Not Going", or "Maybe" directly from the notification or from the game detail screen inside the app.',
  },
  {
    question: 'How do I add or remove players from my roster?',
    answer:
      'Open your team page and tap "Manage Roster". From there you can invite new players by email or username, and remove existing ones. Only captains and commissioners have roster management permissions.',
  },
  {
    question: 'What happens if I miss a payment request?',
    answer:
      'Payment requests sent through Roster are tracked in the "Payments" tab. You can view outstanding and completed requests there. The app links to Venmo or CashApp — Roster does not process payments directly.',
  },
  {
    question: 'How does the substitute system work?',
    answer:
      'If a player can\'t make a game, they can mark themselves as unavailable and optionally request a substitute. Captains are notified and can approve or deny sub requests. Substitutes are sourced from a pool of available players in your league.',
  },
  {
    question: 'Can I use Roster for sports other than hockey?',
    answer:
      'Yes. Roster supports hockey, soccer, baseball, and more. When creating a team or league, select your sport and the app will tailor the stats tracking, positions, and scheduling to that sport.',
  },
  {
    question: 'How do I cancel or change my subscription?',
    answer:
      'Open your profile, tap "Subscription", and you can manage or cancel your plan from there. You can also manage your subscription directly through the App Store or Google Play settings on your device.',
  },
  {
    question: 'I forgot my password. How do I reset it?',
    answer:
      'On the login screen tap "Forgot Password". Enter the email address associated with your account and we\'ll send you a reset link. Check your spam folder if you don\'t see it within a few minutes.',
  },
];

function FAQItem({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex justify-between items-center px-6 py-5 text-left hover:bg-gray-50 transition-colors"
      >
        <span className="font-semibold text-gray-900 text-base">{question}</span>
        {open ? (
          <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0 ml-4" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0 ml-4" />
        )}
      </button>
      {open && (
        <div className="px-6 pb-5 text-gray-600 leading-relaxed text-sm border-t border-gray-100">
          <p className="mt-4">{answer}</p>
        </div>
      )}
    </div>
  );
}

export default function Support() {
  return (
    <MarketingLayout
      title="Support | Roster — Hockey & Sports Team Management"
      description="Get help with Roster. Browse our FAQ, contact support by email, or report a bug. We're here to help you manage your team or league."
      ogTitle="Roster Support"
      ogDescription="Need help with Roster? Find answers to common questions or reach out to our support team directly."
    >
      {/* Hero */}
      <section className="py-20 px-6 bg-gradient-to-b from-blue-50/60 to-white text-center">
        <div className="max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-[#3c82f4]/10 border border-[#3c82f4]/25 rounded-full px-4 py-1.5 mb-5">
            <span className="text-sm font-medium text-[#3c82f4]">We're here to help</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4 leading-tight">
            Roster Support
          </h1>
          <p className="text-lg text-gray-500 max-w-xl mx-auto">
            Browse the FAQ below or reach out directly — we typically respond within one business day.
          </p>
        </div>
      </section>

      {/* Contact cards */}
      <section className="py-12 px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-5">
          <a
            href="mailto:roster.mobile.app@gmail.com"
            className="flex flex-col items-center text-center gap-3 bg-white border border-gray-200 rounded-3xl p-8 hover:border-[#3c82f4]/40 hover:shadow-md transition-all group"
          >
            <div className="w-12 h-12 rounded-2xl bg-[#3c82f4]/10 flex items-center justify-center group-hover:bg-[#3c82f4]/20 transition-colors">
              <Mail className="w-6 h-6 text-[#3c82f4]" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1">Email Support</p>
              <p className="text-sm text-gray-500">roster.mobile.app@gmail.com</p>
            </div>
          </a>

          <a
            href="mailto:roster.mobile.app@gmail.com"
            className="flex flex-col items-center text-center gap-3 bg-white border border-gray-200 rounded-3xl p-8 hover:border-[#3c82f4]/40 hover:shadow-md transition-all group"
          >
            <div className="w-12 h-12 rounded-2xl bg-[#3c82f4]/10 flex items-center justify-center group-hover:bg-[#3c82f4]/20 transition-colors">
              <MessageCircle className="w-6 h-6 text-[#3c82f4]" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1">Share Feedback</p>
              <p className="text-sm text-gray-500">roster.mobile.app@gmail.com</p>
            </div>
          </a>

          <a
            href="mailto:roster.mobile.app@gmail.com"
            className="flex flex-col items-center text-center gap-3 bg-white border border-gray-200 rounded-3xl p-8 hover:border-[#3c82f4]/40 hover:shadow-md transition-all group"
          >
            <div className="w-12 h-12 rounded-2xl bg-[#3c82f4]/10 flex items-center justify-center group-hover:bg-[#3c82f4]/20 transition-colors">
              <Bug className="w-6 h-6 text-[#3c82f4]" />
            </div>
            <div>
              <p className="font-semibold text-gray-900 mb-1">Report a Bug</p>
              <p className="text-sm text-gray-500">roster.mobile.app@gmail.com</p>
            </div>
          </a>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <span className="inline-block text-[#3c82f4] text-sm font-bold uppercase tracking-widest mb-3">
              Common Questions
            </span>
            <h2 className="text-3xl font-bold text-gray-900">Frequently Asked Questions</h2>
          </div>
          <div className="space-y-3">
            {faqs.map((faq) => (
              <FAQItem key={faq.question} question={faq.question} answer={faq.answer} />
            ))}
          </div>
        </div>
      </section>

    </MarketingLayout>
  );
}
