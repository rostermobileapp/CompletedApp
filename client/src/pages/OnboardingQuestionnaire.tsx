import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { ArrowLeft, Check, ChevronRight, Star, X, Users, Shield, Trophy, Calendar, MessageSquare, BarChart2, DollarSign, Zap } from 'lucide-react';
import rosterLightLogo from '@assets/Light_Mode_Logo_1768322748282.png';

const TOTAL_STEPS = 9;

type Screen =
  | 'welcome'
  | 'goal'
  | 'pain'
  | 'join_play_features'
  | 'social_proof'
  | 'solution'
  | 'preferences'
  | 'processing'
  | 'demo'
  | 'paywall';

interface QuestionnaireState {
  goal: string;
  pains: string[];
  sport: string;
  features: string[];
  otherSports: string[];
  otherSportCustom: string;
}

const GOALS = [
  { value: 'join_play', label: "Join a team & just play", emoji: '🏒' },
  { value: 'captain_manage', label: "Run my team like a pro", emoji: '🛡️' },
  { value: 'schedule_organize', label: "Stop the scheduling chaos", emoji: '📅' },
  { value: 'collect_fees', label: "Make collecting fees painless", emoji: '💳' },
  { value: 'run_league', label: "Manage a full league", emoji: '🏆' },
  { value: 'stats_track', label: "Track stats & standings", emoji: '📊' },
];

const PAIN_POINTS = [
  { value: 'group_texts', label: "I live in group texts trying to coordinate", emoji: '📱' },
  { value: 'no_shows', label: "Players confirm then no-show at game time", emoji: '👻' },
  { value: 'fees_awkward', label: "Chasing people for money is awkward", emoji: '😬' },
  { value: 'scattered_info', label: "Game info is scattered across 3 different apps", emoji: '🗂️' },
  { value: 'subs_headache', label: "Finding a sub when someone bails is a nightmare", emoji: '🆘' },
  { value: 'no_visibility', label: "I have no idea who's actually coming until ice time", emoji: '🤷' },
];

const SPORTS = [
  { value: 'hockey', label: "Hockey", emoji: '🏒' },
  { value: 'soccer', label: "Soccer", emoji: '⚽' },
  { value: 'basketball', label: "Basketball", emoji: '🏀' },
  { value: 'baseball', label: "Baseball", emoji: '⚾' },
  { value: 'other', label: "Another sport", emoji: '🏅' },
];

const SPORTS_POLL = [
  { value: 'soccer', label: "Soccer", emoji: '⚽' },
  { value: 'basketball', label: "Basketball", emoji: '🏀' },
  { value: 'baseball', label: "Baseball", emoji: '⚾' },
  { value: 'other', label: "Another sport", emoji: '🏅' },
  { value: 'none', label: "None", emoji: '🚫' },
];

const FEATURES = [
  { value: 'scheduling', label: "Game scheduling & RSVPs", icon: Calendar },
  { value: 'messaging', label: "Team messaging", icon: MessageSquare },
  { value: 'roster', label: "Roster management", icon: Users },
  { value: 'stats', label: "Stats & standings", icon: BarChart2 },
  { value: 'payments', label: "Fee collection", icon: DollarSign },
  { value: 'subs', label: "Sub request tool", icon: Zap },
];

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden">
      <div
        className="h-full bg-[#3c82f4] transition-all duration-500 ease-out rounded-full"
        style={{ width: `${(step / total) * 100}%` }}
      />
    </div>
  );
}

export default function OnboardingQuestionnaire() {
  const [, navigate] = useLocation();
  const { data: userData } = useQuery<{ id?: string }>({ queryKey: ['/api/user'] });
  const isAuthenticated = !!userData?.id;
  const [screen, setScreen] = useState<Screen>('welcome');
  const [state, setState] = useState<QuestionnaireState>({
    goal: '',
    pains: [],
    sport: '',
    features: [],
    otherSports: [],
    otherSportCustom: '',
  });
  const [processingDone, setProcessingDone] = useState(false);
  const processingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const SCREEN_ORDER: Screen[] = state.goal === 'join_play'
    ? ['welcome', 'goal', 'join_play_features', 'social_proof', 'solution', 'preferences', 'processing', 'demo', 'paywall']
    : ['welcome', 'goal', 'pain', 'social_proof', 'solution', 'preferences', 'processing', 'demo', 'paywall'];

  const currentStep = SCREEN_ORDER.indexOf(screen) + 1;

  useEffect(() => {
    if (screen === 'processing') {
      setProcessingDone(false);
      processingTimerRef.current = setTimeout(() => {
        setProcessingDone(true);
        setTimeout(() => goTo('demo'), 400);
      }, 2200);
    }
    return () => {
      if (processingTimerRef.current) clearTimeout(processingTimerRef.current);
    };
  }, [screen]);

  function goTo(s: Screen) {
    setScreen(s);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goBack() {
    const idx = SCREEN_ORDER.indexOf(screen);
    if (idx > 0) goTo(SCREEN_ORDER[idx - 1]);
  }

  function togglePain(val: string) {
    setState(prev => ({
      ...prev,
      pains: prev.pains.includes(val) ? prev.pains.filter(p => p !== val) : [...prev.pains, val],
    }));
  }

  function toggleFeature(val: string) {
    setState(prev => ({
      ...prev,
      features: prev.features.includes(val) ? prev.features.filter(f => f !== val) : [...prev.features, val],
    }));
  }

  const selectedGoal = GOALS.find(g => g.value === state.goal);
  const selectedPains = PAIN_POINTS.filter(p => state.pains.includes(p.value));

  return (
    <div className="min-h-screen bg-white flex flex-col max-w-lg mx-auto">
      {/* Header with progress */}
      {screen !== 'welcome' && screen !== 'paywall' && (
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm px-4 pt-4 pb-3 border-b border-gray-100">
          <div className="flex items-center gap-3 mb-3">
            <button
              onClick={goBack}
              className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors text-gray-400"
              aria-label="Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <ProgressBar step={currentStep} total={TOTAL_STEPS} />
            </div>
            <span className="text-xs text-gray-400 font-medium whitespace-nowrap">{currentStep}/{TOTAL_STEPS}</span>
          </div>
        </div>
      )}
      <div className="flex-1 px-5 pb-8">

        {/* ── WELCOME ─────────────────────────────────── */}
        {screen === 'welcome' && (
          <div className="flex flex-col items-center text-center pt-12 pb-4">
            <img src={rosterLightLogo} alt="Roster" className="h-[72px] object-contain mb-8" />
            <div className="inline-flex items-center gap-2 bg-blue-50 text-[#3c82f4] text-sm font-semibold px-4 py-1.5 rounded-full mb-6">
              🏒 Built for recreational hockey
            </div>
            <h1 className="text-4xl font-black text-gray-900 leading-tight mb-4">
              Your team<br />
              <span className="text-[#3c82f4]">without the chaos.</span>
            </h1>
            <p className="text-gray-500 text-lg mb-10 leading-relaxed">
              Schedules, RSVPs, rosters, stats, payments, and messaging — all in one place. No more group texts.
            </p>

            {/* App mockup preview */}
            <div className="w-full bg-gradient-to-br from-[#3c82f4]/10 to-blue-50 rounded-3xl p-6 mb-8 border border-[#3c82f4]/20">
              <div className="space-y-3">
                {[
                  { icon: Calendar, label: "Thursday 8PM — Pickwick Ice", detail: "12 confirmed · 2 declined", color: "text-[#3c82f4]" },
                  { icon: Users, label: "Roster: 18 players", detail: "All fees collected ✓", color: "text-green-600" },
                  { icon: MessageSquare, label: "Team Chat", detail: "Sub found for Friday! 🎉", color: "text-purple-600" },
                ].map(({ icon: Icon, label, detail, color }) => (
                  <div key={label} className="flex items-center gap-3 bg-white rounded-xl p-3 shadow-sm">
                    <div className={`${color} bg-gray-50 p-2 rounded-lg`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-gray-900">{label}</p>
                      <p className="text-xs text-gray-400">{detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => goTo('goal')}
              className="w-full py-4 rounded-2xl bg-[#3c82f4] text-white font-bold text-lg shadow-lg shadow-blue-200 hover:bg-[#3c82f4]/90 transition-colors"
            >
              Get Started — It's Free
            </button>
            {!isAuthenticated && (
              <button
                onClick={() => navigate('/login')}
                className="mt-3 w-full py-3 rounded-2xl border-2 border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition-colors"
              >
                Already have an account? Log in
              </button>
            )}
          </div>
        )}

        {/* ── GOAL ─────────────────────────────────────── */}
        {screen === 'goal' && (
          <div className="pt-6">
            <h2 className="text-2xl font-black text-gray-900 mb-2">What are you trying to do?</h2>
            <p className="text-gray-500 mb-6">Pick the one that fits best.</p>
            <div className="space-y-3">
              {GOALS.map(g => (
                <button
                  key={g.value}
                  onClick={() => {
                    setState(prev => ({ ...prev, goal: g.value }));
                    setTimeout(() => goTo(g.value === 'join_play' ? 'join_play_features' : 'pain'), 200);
                  }}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left ${
                    state.goal === g.value
                      ? 'border-[#3c82f4] bg-blue-50 text-[#3c82f4]'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span className="text-2xl">{g.emoji}</span>
                  <span className="font-semibold text-gray-900">{g.label}</span>
                  {state.goal === g.value && <Check className="w-5 h-5 ml-auto text-[#3c82f4]" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── PAIN ─────────────────────────────────────── */}
        {screen === 'pain' && (
          <div className="pt-6">
            <h2 className="text-2xl font-black text-gray-900 mb-2">What's been driving you crazy?</h2>
            <p className="text-gray-500 mb-6">Select all that apply.</p>
            <div className="space-y-3">
              {PAIN_POINTS.map(p => {
                const selected = state.pains.includes(p.value);
                return (
                  <button
                    key={p.value}
                    onClick={() => togglePain(p.value)}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left ${
                      selected
                        ? 'border-[#3c82f4] bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <span className="text-2xl">{p.emoji}</span>
                    <span className={`font-semibold flex-1 ${selected ? 'text-[#3c82f4]' : 'text-gray-900'}`}>{p.label}</span>
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 transition-colors ${selected ? 'bg-[#3c82f4]' : 'border-2 border-gray-300'}`}>
                      {selected && <Check className="w-4 h-4 text-white" />}
                    </div>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => goTo('social_proof')}
              disabled={state.pains.length === 0}
              className="mt-6 w-full py-4 rounded-2xl bg-[#3c82f4] text-white font-bold text-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#3c82f4]/90 transition-colors"
            >
              Continue
            </button>
          </div>
        )}

        {/* ── JOIN PLAY FEATURES ───────────────────────── */}
        {screen === 'join_play_features' && (
          <div className="pt-6">
            <h2 className="text-2xl font-black text-gray-900 mb-1">Here's what's waiting for you</h2>
            <p className="text-gray-500 mb-6">Start free. Upgrade when you're ready.</p>

            {/* Free tier */}
            <div className="mb-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-green-600 bg-green-50 px-2.5 py-1 rounded-full">Included Free</span>
              </div>
              <div className="space-y-2">
                {[
                  { icon: Calendar, label: "Game schedule & RSVPs", detail: "See every game, RSVP in one tap" },
                  { icon: MessageSquare, label: "Team chat", detail: "All team comms in one place" },
                  { icon: BarChart2, label: "Stats & standings", detail: "Track your season performance" },
                  { icon: Users, label: "Roster", detail: "Know your teammates" },
                ].map(({ icon: Icon, label, detail }) => (
                  <div key={label} className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm flex items-center gap-3">
                    <div className="bg-green-50 p-2.5 rounded-xl flex-shrink-0">
                      <Icon className="w-5 h-5 text-green-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-gray-900 text-sm">{label}</p>
                      <p className="text-xs text-gray-400">{detail}</p>
                    </div>
                    <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                  </div>
                ))}
              </div>
            </div>

            {/* Player Pro tease */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-[#3c82f4] bg-blue-50 px-2.5 py-1 rounded-full">Player Pro — Unlock More</span>
              </div>
              <div className="space-y-2">
                {[
                  { icon: MessageSquare, label: "Unlock full messaging", detail: "DM any player on any team in your league" },
                  { icon: BarChart2, label: "Unlock full stats", detail: "View stats and trends of any player or team" },
                  { icon: Trophy, label: "Unlock the Wall", detail: "Post on the Wall for your league" },
                ].map(({ icon: Icon, label, detail }) => (
                  <div key={label} className="bg-gray-50 rounded-2xl p-4 border border-gray-200 flex items-center gap-3 opacity-70">
                    <div className="bg-blue-50 p-2.5 rounded-xl flex-shrink-0">
                      <Icon className="w-5 h-5 text-[#3c82f4]" />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-gray-700 text-sm">{label}</p>
                      <p className="text-xs text-gray-400">{detail}</p>
                    </div>
                    <span className="text-xs font-bold text-[#3c82f4] bg-blue-50 border border-[#3c82f4]/20 px-2 py-0.5 rounded-full flex-shrink-0">Pro</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => goTo('social_proof')}
              className="w-full py-4 rounded-2xl bg-[#3c82f4] text-white font-bold text-lg hover:bg-[#3c82f4]/90 transition-colors"
            >
              Looks good — let's go →
            </button>
          </div>
        )}

        {/* ── SOCIAL PROOF ─────────────────────────────── */}
        {screen === 'social_proof' && (
          <div className="pt-[4px]">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-black mb-2 text-[#3c82f4]">What users are saying:</h2>
            </div>

            <div className="space-y-4 mb-8">
              {/* Real testimonial */}
              <div className="bg-gradient-to-br from-[#3c82f4]/5 to-blue-50 rounded-2xl p-5 border border-[#3c82f4]/20">
                <div className="flex gap-0.5 mb-3">
                  {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />)}
                </div>
                <p className="text-gray-700 font-medium leading-relaxed mb-3">
                  "I've had different leagues use different apps and Roster is the best BY FAR"
                </p>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[#3c82f4] text-white flex items-center justify-center text-sm font-bold">S</div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Scott C.</p>
                    <p className="text-xs text-gray-400">Colorado</p>
                  </div>
                </div>
              </div>

              {/* Placeholder testimonials */}
              <div className="bg-gradient-to-br from-[#3c82f4]/5 to-blue-50 rounded-2xl p-5 border border-[#3c82f4]/20">
                <div className="flex gap-0.5 mb-3">
                  {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />)}
                </div>
                <p className="text-gray-700 font-medium leading-relaxed mb-3">
                  "The substitute player request system is the crown jewel of this app.  This feature alone makes Roster worth it if you are a Captain."
                </p>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[#3c82f4] text-white flex items-center justify-center text-sm font-bold">J</div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">James K.</p>
                    <p className="text-xs text-gray-400">Ohio</p>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-[#3c82f4]/5 to-blue-50 rounded-2xl p-5 border border-[#3c82f4]/20">
                <div className="flex gap-0.5 mb-3">
                  {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />)}
                </div>
                <p className="text-gray-700 font-medium leading-relaxed mb-3">
                  "As a league commissioner, my life was made easy whether it was scheduling, finding subs, assigning the drinks, or generating a complex tournament bracket... Roster had us covered."
                </p>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[#3c82f4] text-white flex items-center justify-center text-sm font-bold">B</div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Brian W.</p>
                    <p className="text-xs text-gray-400">Ohio</p>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={() => goTo('solution')}
              className="w-full py-4 rounded-2xl bg-[#3c82f4] text-white font-bold text-lg hover:bg-[#3c82f4]/90 transition-colors"
            >
              See how it works
            </button>
          </div>
        )}

        {/* ── SOLUTION ─────────────────────────────────── */}
        {screen === 'solution' && (
          <div className="pt-6">
            <h2 className="text-2xl font-black text-gray-900 mb-2">
              Here's your fix
            </h2>
            <p className="text-gray-500 mb-6">
              Roster solves every one of those frustrations.
            </p>

            <div className="space-y-4 mb-8">
              {selectedPains.length > 0
                ? selectedPains.slice(0, 4).map(pain => {
                    const solutions: Record<string, { fix: string; stat: string; icon: typeof Calendar }> = {
                      group_texts: { fix: "One app for everything — schedule, RSVP, chat", stat: "Players respond 4x faster in-app vs group text", icon: MessageSquare },
                      no_shows: { fix: "Real-time RSVP with attendance tracking.\nPush notifications give players active reminders.", stat: "Teams see 60% fewer game-day no-shows", icon: Calendar },
                      fees_awkward: { fix: "Built-in payment tracking with Venmo & CashApp links", stat: "Captains collect fees in days, not weeks", icon: DollarSign },
                      scattered_info: { fix: "One home for schedules, rosters, stats & chat", stat: "Players stop asking 'what time is the game?'", icon: Zap },
                      subs_headache: { fix: "Automated sub request tool notifies your whole pool", stat: "Most captains find a sub in under 5 minutes", icon: Users },
                      no_visibility: { fix: "Live RSVP dashboard shows who's in, who's out", stat: "Know your lineup 48 hours before every game", icon: Shield },
                    };
                    const sol = solutions[pain.value] || solutions.scattered_info;
                    const Icon = sol.icon;
                    return (
                      <div key={pain.value} className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
                        <div className="flex items-start gap-3">
                          <div className="bg-blue-50 p-2.5 rounded-xl flex-shrink-0">
                            <Icon className="w-5 h-5 text-[#3c82f4]" />
                          </div>
                          <div>
                            <p className="text-xs text-gray-400 mb-0.5 line-through">{pain.label}</p>
                            <p className="font-bold text-gray-900 text-sm whitespace-pre-line">{sol.fix}</p>
                            <p className="text-xs text-[#3c82f4] font-medium mt-1">{sol.stat}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                : [
                    { icon: Calendar, title: "Smart scheduling & RSVPs", stat: "Know your lineup 48 hours early" },
                    { icon: MessageSquare, title: "Team messaging built-in", stat: "No more group text chaos" },
                    { icon: DollarSign, title: "Fee tracking & payment links", stat: "Collect dues in days, not weeks" },
                    { icon: Zap, title: "Automated sub requests", stat: "Find a sub in under 20 minutes" },
                  ].map(({ icon: Icon, title, stat }) => (
                    <div key={title} className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="bg-blue-50 p-2.5 rounded-xl">
                          <Icon className="w-5 h-5 text-[#3c82f4]" />
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 text-sm">{title}</p>
                          <p className="text-xs text-[#3c82f4] font-medium">{stat}</p>
                        </div>
                      </div>
                    </div>
                  ))
              }
            </div>

            <button
              onClick={() => goTo('preferences')}
              className="w-full py-4 rounded-2xl bg-[#3c82f4] text-white font-bold text-lg hover:bg-[#3c82f4]/90 transition-colors"
            >
              Set up my experience →
            </button>
          </div>
        )}

        {/* ── PREFERENCES ──────────────────────────────── */}
        {screen === 'preferences' && (
          <div className="pt-6">
            <h2 className="text-2xl font-black text-gray-900 mb-2">What matters most to you?</h2>
            <p className="text-gray-500 mb-6">Pick the features you care about most.</p>
            <div className="grid grid-cols-2 gap-3 mb-6">
              {FEATURES.map(f => {
                const selected = state.features.includes(f.value);
                const Icon = f.icon;
                return (
                  <button
                    key={f.value}
                    onClick={() => toggleFeature(f.value)}
                    className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 transition-all ${
                      selected
                        ? 'border-[#3c82f4] bg-blue-50 text-[#3c82f4]'
                        : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    <Icon className={`w-6 h-6 ${selected ? 'text-[#3c82f4]' : 'text-gray-400'}`} />
                    <span className={`text-xs font-semibold text-center leading-tight ${selected ? 'text-[#3c82f4]' : 'text-gray-700'}`}>{f.label}</span>
                    {selected && <Check className="w-4 h-4 text-[#3c82f4]" />}
                  </button>
                );
              })}
            </div>

            <div className="mb-6">
              <p className="text-sm font-semibold text-gray-700 mb-1">What other sports would you consider using Roster for?</p>
              <p className="text-xs text-gray-400 mb-3">Select all that apply.</p>
              <div className="grid grid-cols-3 gap-2">
                {SPORTS_POLL.map(s => {
                  const selected = state.otherSports.includes(s.value);
                  return (
                    <button
                      key={s.value}
                      onClick={() => {
                        setState(prev => {
                          if (prev.otherSports.includes(s.value)) {
                            const next = prev.otherSports.filter(v => v !== s.value);
                            return { ...prev, otherSports: next, otherSportCustom: s.value === 'other' ? '' : prev.otherSportCustom };
                          }
                          if (s.value === 'none') {
                            return { ...prev, otherSports: ['none'], otherSportCustom: '' };
                          }
                          const next = [...prev.otherSports.filter(v => v !== 'none'), s.value];
                          return { ...prev, otherSports: next };
                        });
                      }}
                      className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all ${
                        selected ? 'border-[#3c82f4] bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <span className="text-xl">{s.emoji}</span>
                      <span className={`text-xs font-semibold text-center leading-tight ${selected ? 'text-[#3c82f4]' : 'text-gray-700'}`}>{s.label}</span>
                    </button>
                  );
                })}
              </div>
              {state.otherSports.includes('other') && (
                <input
                  type="text"
                  value={state.otherSportCustom}
                  onChange={e => setState(prev => ({ ...prev, otherSportCustom: e.target.value }))}
                  placeholder="Which sport?"
                  className="mt-3 w-full px-4 py-2.5 rounded-xl border-2 border-[#3c82f4] bg-blue-50 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
                  autoFocus
                />
              )}
            </div>

            <button
              onClick={async () => {
                if (state.otherSports.length > 0) {
                  try {
                    await fetch('/api/onboarding-sport-poll', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        sports: state.otherSports,
                        otherSportText: state.otherSports.includes('other') ? state.otherSportCustom || null : null,
                      }),
                    });
                  } catch (_) {}
                }
                goTo('processing');
              }}
              className="w-full py-4 rounded-2xl bg-[#3c82f4] text-white font-bold text-lg hover:bg-[#3c82f4]/90 transition-colors"
            >
              Build my Roster →
            </button>
          </div>
        )}

        {/* ── PROCESSING ───────────────────────────────── */}
        {screen === 'processing' && (
          <div className="flex flex-col items-center justify-center min-h-[70vh] text-center">
            <div className="relative mb-8">
              <div className="w-20 h-20 rounded-full border-4 border-blue-100 border-t-[#3c82f4] animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <img src={rosterLightLogo} alt="Roster" className="h-8 object-contain" />
              </div>
            </div>
            <h2 className="text-2xl font-black text-gray-900 mb-3">Building your Roster...</h2>
            <p className="text-gray-500">Personalising your experience based on your answers</p>
            <div className="mt-6 space-y-2">
              {[
                { label: "Configuring team tools", done: true },
                { label: "Setting up your sport", done: processingDone },
                { label: "Preparing your dashboard", done: false },
              ].map((item, i) => (
                <div key={item.label} className="flex items-center gap-2 text-sm text-gray-500">
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center ${item.done ? 'bg-green-500' : 'bg-gray-200 animate-pulse'}`}>
                    {item.done && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                  <span className={item.done ? 'text-green-600 font-medium' : ''}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── DEMO ─────────────────────────────────────── */}
        {screen === 'demo' && (
          <DemoScreen
            goal={state.goal}
            sport={state.sport}
            features={state.features}
            onContinue={() => goTo('paywall')}
          />
        )}

        {/* ── PAYWALL ──────────────────────────────────── */}
        {screen === 'paywall' && (
          <PaywallScreen
            isAuthenticated={isAuthenticated}
            onSignUp={() => navigate(isAuthenticated ? '/' : '/login')}
            onSkip={() => navigate('/login')}
          />
        )}
      </div>
    </div>
  );
}

function DemoScreen({
  goal,
  sport,
  features,
  onContinue,
}: {
  goal: string;
  sport: string;
  features: string[];
  onContinue: () => void;
}) {
  const [rsvps, setRsvps] = useState<Record<string, 'yes' | 'no' | null>>({});
  const [submitted, setSubmitted] = useState(false);

  const sportEmoji = sport === 'hockey' ? '🏒' : sport === 'soccer' ? '⚽' : sport === 'basketball' ? '🏀' : sport === 'baseball' ? '⚾' : '🏅';
  const sportName = sport === 'hockey' ? 'Hockey' : sport === 'soccer' ? 'Soccer' : sport === 'basketball' ? 'Basketball' : sport === 'baseball' ? 'Baseball' : 'Sports';

  const players = [
    { name: 'Alex M.', number: '#11', position: 'Forward' },
    { name: 'Jordan K.', number: '#4', position: 'Defense' },
    { name: 'Sam R.', number: '#22', position: 'Goalie' },
    { name: 'Chris T.', number: '#7', position: 'Forward' },
    { name: 'Taylor N.', number: '#15', position: 'Defense' },
  ];

  const yesCount = Object.values(rsvps).filter(v => v === 'yes').length;
  const noCount = Object.values(rsvps).filter(v => v === 'no').length;
  const doneCount = yesCount + noCount;

  if (submitted) {
    return (
      <div className="pt-6">
        <div className="text-center mb-6">
          <div className="text-5xl mb-3">{sportEmoji}</div>
          <h2 className="text-2xl font-black text-gray-900 mb-2">Your team's ready!</h2>
          <p className="text-gray-500">Here's your live game status</p>
        </div>

        <div className="bg-gradient-to-br from-[#3c82f4]/10 to-blue-50 rounded-2xl p-5 border border-[#3c82f4]/20 mb-5">
          <div className="flex items-center justify-between mb-3">
            <p className="font-bold text-gray-900">{sportEmoji} Thursday Night {sportName}</p>
            <span className="text-xs bg-green-100 text-green-700 font-semibold px-2 py-0.5 rounded-full">Live</span>
          </div>
          <div className="flex gap-4 mb-4">
            <div className="flex-1 bg-white rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-green-600">{yesCount}</p>
              <p className="text-xs text-gray-500 font-medium">Confirmed</p>
            </div>
            <div className="flex-1 bg-white rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-red-500">{noCount}</p>
              <p className="text-xs text-gray-500 font-medium">Can't make it</p>
            </div>
            <div className="flex-1 bg-white rounded-xl p-3 text-center">
              <p className="text-2xl font-black text-gray-400">{players.length - doneCount}</p>
              <p className="text-xs text-gray-500 font-medium">No reply</p>
            </div>
          </div>
        </div>

        <p className="text-sm text-center text-gray-400 mb-5">This is exactly what your dashboard looks like — live, for every game.</p>

        <button
          onClick={onContinue}
          className="w-full py-4 rounded-2xl bg-[#3c82f4] text-white font-bold text-lg hover:bg-[#3c82f4]/90 transition-colors"
        >
          Get this for my team →
        </button>
      </div>
    );
  }

  return (
    <div className="pt-6">
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 bg-green-50 text-green-700 text-sm font-semibold px-4 py-1.5 rounded-full mb-4">
          {sportEmoji} Your team is ready
        </div>
        <h2 className="text-2xl font-black text-gray-900 mb-2">Try it — RSVP your players</h2>
        <p className="text-gray-500 text-sm">Tap yes or no for each player, just like your team would.</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-5 shadow-sm">
        <div className="bg-[#3c82f4]/5 border-b border-gray-100 px-4 py-3">
          <p className="font-bold text-gray-900 text-sm">{sportEmoji} Thursday Night {sportName} — 8:00 PM</p>
          <p className="text-xs text-gray-400">Pickwick Recreation Center</p>
        </div>
        <div className="divide-y divide-gray-100">
          {players.map(player => {
            const rsvp = rsvps[player.name];
            return (
              <div key={player.name} className="flex items-center px-4 py-3 gap-3">
                <div className="w-9 h-9 rounded-full bg-[#3c82f4]/10 flex items-center justify-center text-sm font-bold text-[#3c82f4]">
                  {player.name[0]}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-900">{player.name}</p>
                  <p className="text-xs text-gray-400">{player.number} · {player.position}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setRsvps(prev => ({ ...prev, [player.name]: prev[player.name] === 'yes' ? null : 'yes' }))}
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${rsvp === 'yes' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400 hover:bg-green-50'}`}
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setRsvps(prev => ({ ...prev, [player.name]: prev[player.name] === 'no' ? null : 'no' }))}
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${rsvp === 'no' ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-400 hover:bg-red-50'}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <button
        onClick={() => setSubmitted(true)}
        disabled={doneCount === 0}
        className="w-full py-4 rounded-2xl bg-[#3c82f4] text-white font-bold text-lg disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#3c82f4]/90 transition-colors"
      >
        {doneCount === 0 ? 'RSVP at least one player to continue' : `See my team's game status →`}
      </button>
      <p className="text-center text-xs text-gray-400 mt-2">{doneCount}/{players.length} RSVPs recorded</p>
    </div>
  );
}

function PaywallScreen({ isAuthenticated, onSignUp, onSkip }: { isAuthenticated: boolean; onSignUp: () => void; onSkip: () => void }) {
  const { data: stripePrices } = useQuery<{
    player_pro_monthly?: { amount: number | null; currency: string | null };
    commissioner_monthly?: { amount: number | null; currency: string | null };
  }>({ queryKey: ['/api/stripe/prices'] });

  const proAmount = stripePrices?.player_pro_monthly?.amount;
  const proDisplay = proAmount != null ? `$${proAmount % 1 === 0 ? proAmount : proAmount.toFixed(2)}` : '~$6';

  const commAmount = stripePrices?.commissioner_monthly?.amount;
  const commDisplay = commAmount != null ? `$${commAmount % 1 === 0 ? commAmount : commAmount.toFixed(2)}` : '~$14';

  return (
    <div className="pt-8 pb-4">
      <img src={rosterLightLogo} alt="Roster" className="h-10 object-contain mx-auto mb-6" />
      {/* Plans */}
      <div className="space-y-3 mb-6">

        {/* Free */}
        <div className="rounded-2xl border-2 border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="font-bold text-gray-900">Free</p>
              <p className="text-xs text-gray-400">Great for players on a team</p>
            </div>
            <p className="text-2xl font-black text-gray-900">$0</p>
          </div>
          <div className="space-y-1">
            {['Team schedule & RSVPs', 'Team chat', 'Stats & standings'].map(f => (
              <div key={f} className="flex items-center gap-2 text-xs text-gray-500">
                <Check className="w-3.5 h-3.5 text-green-500" /> {f}
              </div>
            ))}
          </div>
        </div>

        {/* Player Pro — highlighted */}
        <div className="rounded-2xl border-2 border-[#3c82f4] bg-[#3c82f4]/5 p-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 bg-[#3c82f4] text-white text-xs font-bold px-3 py-1 rounded-bl-xl">Most popular</div>
          <div className="flex items-center justify-between mb-2 pr-20">
            <div>
              <p className="font-bold text-[#3c82f4]">Player Pro</p>
              <p className="text-xs text-gray-500">For captains & active players</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black text-[#3c82f4]">{proDisplay}</p>
              <p className="text-xs text-gray-400">/month</p>
            </div>
          </div>
          <div className="space-y-1">
            {['Everything in Free', 'Roster & attendance tracking', 'Sub request tool', 'Fee & payment tracking', 'Polls & bulletins', 'Create team events'].map(f => (
              <div key={f} className="flex items-center gap-2 text-xs text-gray-700">
                <Check className="w-3.5 h-3.5 text-[#3c82f4]" /> {f}
              </div>
            ))}
          </div>
        </div>

        {/* Commissioner */}
        <div className="rounded-2xl border-2 border-gray-800 p-4 relative overflow-hidden bg-[#3c82f4]">
          <div className="absolute top-0 right-0 bg-gray-700 text-gray-200 text-xs font-bold px-3 py-1 rounded-bl-xl">For leagues</div>
          <div className="flex items-center justify-between mb-2 pr-24">
            <div>
              <p className="font-bold text-white">Commissioner</p>
              <p className="text-xs text-[#ffffff]">Run a full league or tournament</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black text-white">{commDisplay}</p>
              <p className="text-xs text-gray-500">/month</p>
            </div>
          </div>
          <div className="space-y-1">
            {['Everything in Player Pro', 'A-Z League Management', 'Bracket Generation Tool', 'In-Game Scorekeeping', 'Tournaments Mode', 'League Drafts'].map(f => (
              <div key={f} className="flex items-center gap-2 text-xs text-[#ffffff]">
                <Check className="w-3.5 h-3.5 text-gray-400" /> {f}
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="text-center text-xs text-gray-400 mb-5">
        Free to start. Visit the Subscriptions in your Profile page to upgrade for the full range of features.
      </p>
      <button
        onClick={onSignUp}
        className="w-full py-4 rounded-2xl bg-[#3c82f4] text-white font-bold text-lg hover:bg-[#3c82f4]/90 transition-colors shadow-lg shadow-blue-200"
      >
        {isAuthenticated ? 'Go to my dashboard →' : 'Create My Free Account'}
      </button>
    </div>
  );
}
