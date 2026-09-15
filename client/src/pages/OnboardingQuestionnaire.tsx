import { useState, useEffect, useRef } from 'react';
import { setSubscriberAttributes } from '@/lib/nativePurchases';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { ArrowLeft, BarChart2, Bell, Calendar, Check, DollarSign, MessageSquare, Star, Trophy, Users, Zap } from 'lucide-react';
import rosterLightLogo from '@assets/Light_Mode_Logo_1768322748282.png';

const TOTAL_STEPS = 9;

type OnboardingRole =
  | 'player'
  | 'team_captain'
  | 'league_manager'
  | 'tournament_organizer'
  | 'scorekeeper'
  | 'coach'
  | 'parent';

type Screen =
  | 'welcome'
  | 'social_proof'
  | 'role'
  | 'pain'
  | 'join_play_features'
  | 'solution'
  | 'preferences'
  | 'processing'
  | 'paywall';

const QUESTIONNAIRE_SCREENS: { value: Screen; label: string }[] = [
  { value: 'welcome', label: 'Welcome' },
  { value: 'social_proof', label: 'Social proof' },
  { value: 'role', label: 'Role' },
  { value: 'pain', label: 'Pain points' },
  { value: 'join_play_features', label: 'Join-play features' },
  { value: 'solution', label: 'Solution' },
  { value: 'preferences', label: 'Preferences' },
  { value: 'processing', label: 'Processing' },
  { value: 'paywall', label: 'Paywall' },
];

interface QuestionnaireState {
  role: OnboardingRole | '';
  pains: string[];
  referralCode: string;
  referralPartnerId: string;
  referralOtherText: string;
}

const GOALS: Array<{
  value: OnboardingRole;
  label: string;
  emoji: string;
  comingSoon?: boolean;
}> = [
  { value: 'player', label: 'Player', emoji: '🏒' },
  { value: 'team_captain', label: 'Team Captain', emoji: '🛡️' },
  { value: 'league_manager', label: 'League Manager', emoji: '📅' },
  { value: 'tournament_organizer', label: 'Tournament Organizer', emoji: '🏆' },
  { value: 'scorekeeper', label: 'Scorekeeper', emoji: '📊' },
  { value: 'coach', label: 'Coach', emoji: '🎓', comingSoon: true },
  { value: 'parent', label: 'Parent', emoji: '👪', comingSoon: true },
];

interface PainPoint {
  value: string;
  label: string;
  solution: string;
  icon: typeof Calendar;
}

const ROLE_PAIN_POINTS: Record<OnboardingRole, PainPoint[]> = {
  player: [
    { value: 'player_game_status', label: 'Is the game still on tonight?', solution: 'Real-time game status and cancellation alerts', icon: Calendar },
    { value: 'player_schedule_details', label: 'What time & which locker room?', solution: 'Full schedule with rink details in one place', icon: Calendar },
    { value: 'player_rsvp', label: 'Did I RSVP?', solution: 'Push reminders before every game', icon: Bell },
    { value: 'player_standings', label: 'What are the standings?', solution: 'Live standings updated after every game', icon: BarChart2 },
    { value: 'player_teammate_contact', label: 'How do I reach a teammate?', solution: 'Team & Individual chats', icon: MessageSquare },
  ],
  team_captain: [
    { value: 'captain_attendance', label: "Who's actually showing up?", solution: 'Live RSVP dashboard before every game', icon: Users },
    { value: 'captain_fees', label: 'Tracking & collecting fees', solution: 'Built-in payment requests and tracking', icon: DollarSign },
    { value: 'captain_subs', label: 'Finding Subs', solution: 'Smart sub tool', icon: Users },
    { value: 'captain_lines', label: 'Line Combos', solution: 'Line tool with point projections', icon: BarChart2 },
  ],
  league_manager: [
    { value: 'league_schedule_building', label: 'Schedules take forever to build', solution: 'Schedule upload tool', icon: Calendar },
    { value: 'league_stats', label: 'Updating stats & standings', solution: 'Auto-updated after every score entry', icon: BarChart2 },
    { value: 'league_fees', label: 'Fees coming in 10 different ways', solution: 'Centralized payment collection', icon: DollarSign },
    { value: 'league_schedule_changes', label: 'Schedule changes', solution: 'Push all updates instantly to all teams', icon: Bell },
  ],
  tournament_organizer: [
    { value: 'tournament_brackets', label: 'Bracket Updates mid-tournament', solution: 'Bracket management with live updates', icon: Trophy },
    { value: 'tournament_announcements', label: 'Announcements', solution: 'Broadcast messaging to all participants', icon: MessageSquare },
    { value: 'tournament_payments', label: 'Deposits and payments untracked', solution: 'Payment dashboard', icon: DollarSign },
  ],
  scorekeeper: [
    { value: 'scorekeeper_updates', label: 'Delay with updates', solution: 'Enter stats live in the app', icon: Zap },
    { value: 'scorekeeper_paper', label: 'Paper to Digital Conversion', solution: 'Eliminate paper completely', icon: BarChart2 },
  ],
  coach: [
    { value: 'coach_lines', label: 'Line combos exist only in my head', solution: 'Build and share lines before the game', icon: Users },
    { value: 'coach_notes', label: 'Game notes no one else can see', solution: 'Share notes with parents and players', icon: MessageSquare },
    { value: 'coach_announcements', label: 'Announcements for parents', solution: 'Parent chat and announcements', icon: Bell },
  ],
  parent: [
    { value: 'parent_schedule', label: 'Schedule changes', solution: 'Real-time updates', icon: Calendar },
    { value: 'parent_progress', label: 'How is my child doing?', solution: 'Updates and progress from coach', icon: BarChart2 },
    { value: 'parent_chat', label: 'Parent chat?', solution: 'Parents have their own chat', icon: MessageSquare },
  ],
};

const SCREEN_ORDER: Screen[] = [
  'welcome',
  'social_proof',
  'role',
  'pain',
  'join_play_features',
  'solution',
  'preferences',
  'processing',
  'paywall',
];

const PREVIEW_SAMPLE_PAINS = ROLE_PAIN_POINTS.player.slice(0, 3).map((pain) => pain.value);

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
  const previewParam = new URLSearchParams(window.location.search).get('preview');
  const previewScreen = import.meta.env.DEV && QUESTIONNAIRE_SCREENS.some(({ value }) => value === previewParam)
    ? previewParam as Screen
    : null;
  const isPreviewMode = import.meta.env.DEV && previewParam !== null;
  const [screen, setScreen] = useState<Screen>(previewScreen || 'welcome');
  const [state, setState] = useState<QuestionnaireState>({
    role: previewScreen ? 'player' : '',
    pains: previewScreen ? PREVIEW_SAMPLE_PAINS : [],
    referralCode: '',
    referralPartnerId: '',
    referralOtherText: '',
  });

  const { data: approvedPartners = [] } = useQuery<Array<{ id: string; orgName: string }>>({
    queryKey: ['/api/referral/approved-partners'],
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const [processingDone, setProcessingDone] = useState(false);
  const processingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentStep = SCREEN_ORDER.indexOf(screen) + 1;

  useEffect(() => {
    if (screen === 'processing') {
      setProcessingDone(false);
      processingTimerRef.current = setTimeout(() => {
        setProcessingDone(true);
        setTimeout(() => goTo('paywall'), 400);
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

  function selectPreviewScreen(nextScreen: Screen) {
    const params = new URLSearchParams(window.location.search);
    params.set('preview', nextScreen);
    window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
    setScreen(nextScreen);
    setState(prev => ({
      ...prev,
      role: prev.role || 'player',
      pains: prev.pains.length > 0 ? prev.pains : PREVIEW_SAMPLE_PAINS,
    }));
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

  const selectedRole = GOALS.find(g => g.value === state.role);
  const rolePainPoints = state.role ? ROLE_PAIN_POINTS[state.role] : [];
  const selectedPains = rolePainPoints.filter(p => state.pains.includes(p.value));

  return (
    <div className="min-h-screen bg-white flex flex-col max-w-lg mx-auto">
      {isPreviewMode && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border-b border-amber-200 text-amber-950">
          <span className="text-xs font-bold uppercase tracking-wide whitespace-nowrap">Dev preview</span>
          <select
            value={screen}
            onChange={(event) => selectPreviewScreen(event.target.value as Screen)}
            className="min-w-0 flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-gray-900"
            aria-label="Preview onboarding screen"
          >
            {QUESTIONNAIRE_SCREENS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      )}
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
            <div className="inline-flex items-center gap-2 bg-blue-50 text-[#3c82f4] font-semibold px-4 py-1.5 rounded-full mb-6 text-[16px]">Built JUST for Hockey</div>
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
              onClick={() => goTo('social_proof')}
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

              <div className="bg-gradient-to-br from-[#3c82f4]/5 to-blue-50 rounded-2xl p-5 border border-[#3c82f4]/20">
                <div className="flex gap-0.5 mb-3">
                  {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />)}
                </div>
                <p className="text-gray-700 font-medium leading-relaxed mb-3">
                  "The substitute player request system is the crown jewel of this app. This feature alone makes Roster worth it if you are a Captain."
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
              onClick={() => goTo('role')}
              className="w-full py-4 rounded-2xl bg-[#3c82f4] text-white font-bold text-lg hover:bg-[#3c82f4]/90 transition-colors"
            >
              Choose my role →
            </button>
          </div>
        )}

        {/* ── ROLE ──────────────────────────────────────── */}
        {screen === 'role' && (
          <div className="pt-6">
            <h2 className="text-2xl font-black text-gray-900 mb-2">What is your Role?</h2>
            <p className="text-gray-500 mb-6">Pick the one that fits best.</p>
            <div className="space-y-3">
              {GOALS.map(g => (
                <button
                  key={g.value}
                  type="button"
                  disabled={g.comingSoon}
                  onClick={() => {
                    if (g.comingSoon) return;
                    setState(prev => ({ ...prev, role: g.value, pains: [] }));
                    setTimeout(() => goTo('pain'), 200);
                  }}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left ${
                    g.comingSoon
                      ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
                      : state.role === g.value
                      ? 'border-[#3c82f4] bg-blue-50 text-[#3c82f4]'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span className="text-2xl">{g.emoji}</span>
                  <span className="font-semibold flex-1 text-gray-900">{g.label}</span>
                  {g.comingSoon ? (
                    <span className="text-xs font-bold uppercase tracking-wide text-gray-400">Coming soon</span>
                  ) : state.role === g.value ? (
                    <Check className="w-5 h-5 ml-auto text-[#3c82f4]" />
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── PAIN ─────────────────────────────────────── */}
        {screen === 'pain' && (
          <div className="pt-6">
            <h2 className="text-2xl font-black text-gray-900 mb-2">What is getting in your way?</h2>
            <p className="text-gray-500 mb-2">Select all that apply.</p>
            {selectedRole && (
              <p className="text-sm text-[#3c82f4] font-semibold mb-6">
                Showing challenges for {selectedRole.label}
              </p>
            )}
            <div className="space-y-3">
              {rolePainPoints.map(p => {
                const selected = state.pains.includes(p.value);
                return (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => togglePain(p.value)}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all text-left ${
                      selected
                        ? 'border-[#3c82f4] bg-blue-50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <span className={`font-semibold flex-1 ${selected ? 'text-[#3c82f4]' : 'text-gray-900'}`}>{p.label}</span>
                    <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 transition-colors ${selected ? 'bg-[#3c82f4]' : 'border-2 border-gray-300'}`}>
                      {selected && <Check className="w-4 h-4 text-white" />}
                    </div>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => goTo('join_play_features')}
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
              onClick={() => goTo('solution')}
              className="w-full py-4 rounded-2xl bg-[#3c82f4] text-white font-bold text-lg hover:bg-[#3c82f4]/90 transition-colors"
            >
              Looks good — let's go →
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
                ? selectedPains.map(pain => {
                    const Icon = pain.icon;
                    return (
                      <div key={pain.value} className="bg-white rounded-2xl p-4 border border-gray-200 shadow-sm">
                        <div className="flex items-start gap-3">
                          <div className="bg-blue-50 p-2.5 rounded-xl flex-shrink-0">
                            <Icon className="w-5 h-5 text-[#3c82f4]" />
                          </div>
                          <div>
                            <p className="text-xs text-gray-400 mb-0.5 line-through">{pain.label}</p>
                            <p className="font-bold text-gray-900 text-sm">{pain.solution}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                : (
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 text-center text-sm text-gray-500">
                    Select at least one challenge to see how Roster helps.
                  </div>
                )
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
            <h2 className="text-2xl font-black text-gray-900 mb-2">How did you hear about us?</h2>
            <p className="text-gray-500 mb-6">Select your hockey association or partner organization, if applicable.</p>

            {/* Who referred you dropdown */}
            <div className="mb-6">
              <p className="text-sm font-semibold text-gray-700 mb-1">Who referred you to Roster? <span className="font-normal text-gray-400">(optional)</span></p>
              <p className="text-xs text-gray-400 mb-2">Select your hockey association or partner organization.</p>
              <select
                value={state.referralPartnerId}
                onChange={e => {
                  const val = e.target.value;
                  setState(prev => ({ ...prev, referralPartnerId: val, referralOtherText: val !== 'other' ? '' : prev.referralOtherText }));
                }}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm text-gray-900 bg-white focus:outline-none focus:border-[#3c82f4] transition-colors appearance-none"
              >
                {approvedPartners.map(p => (
                  <option key={p.id} value={p.id}>{p.orgName}</option>
                ))}
                <option value="other">Other</option>
                <option value="">— None —</option>
              </select>
              {state.referralPartnerId === 'other' && (
                <textarea
                  value={state.referralOtherText}
                  onChange={e => setState(prev => ({ ...prev, referralOtherText: e.target.value }))}
                  placeholder="Who referred you? (e.g. organization name, coach's name)"
                  maxLength={200}
                  rows={2}
                  className="mt-2 w-full px-4 py-2.5 border-2 border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-[#3c82f4] transition-colors resize-none"
                  autoFocus
                />
              )}
            </div>

            <button
              onClick={async () => {
                const saves: Promise<void>[] = [];

                // Persist referral selection to user profile (authenticated users only)
                const hasRealPartner = state.referralPartnerId && state.referralPartnerId !== 'other';
                const hasOther = state.referralPartnerId === 'other';
                if (isAuthenticated && (hasRealPartner || hasOther)) {
                  saves.push(
                    fetch('/api/user/onboarding', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify({
                        referralPartnerId: hasRealPartner ? state.referralPartnerId : undefined,
                        referralSourceOther: hasOther ? (state.referralOtherText || 'other') : undefined,
                      }),
                    }).then(async (res) => {
                      if (res.ok) {
                        const data = await res.json().catch(() => ({}));
                        const attrs: Record<string, string> = {};
                        if (data.referralPartnerId) attrs['referral_partner_id'] = data.referralPartnerId;
                        if (data.referralCode) attrs['referral_code'] = data.referralCode;
                        if (Object.keys(attrs).length > 0) {
                          // Push to RevenueCat subscriber attributes via native bridge (no-op in browser)
                          setSubscriberAttributes(attrs);
                          // Also persist to localStorage so the next purchase call picks it up
                          try {
                            if (attrs['referral_partner_id']) localStorage.setItem('pendingReferralPartnerId', attrs['referral_partner_id']);
                            if (attrs['referral_code']) localStorage.setItem('pendingReferralCode', attrs['referral_code']);
                          } catch {}
                        }
                      }
                    }).catch(() => {})
                  );
                } else if (isAuthenticated && !state.referralPartnerId) {
                  // Explicit "None" selection — clear any prior referral
                  saves.push(
                    fetch('/api/user/onboarding', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify({ clearReferral: true }),
                    }).then(() => {
                      try {
                        localStorage.removeItem('pendingReferralPartnerId');
                        localStorage.removeItem('pendingReferralCode');
                      } catch {}
                    }).catch(() => {})
                  );
                }

                await Promise.all(saves);
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

        {/* ── PAYWALL ──────────────────────────────────── */}
        {screen === 'paywall' && (
          <PaywallScreen
            isAuthenticated={isAuthenticated}
            onSignUp={() => navigate(isAuthenticated ? '/' : '/login')}
          />
        )}
      </div>
    </div>
  );
}

function PaywallScreen({ isAuthenticated, onSignUp }: { isAuthenticated: boolean; onSignUp: () => void }) {
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
              <p className="text-gray-900 text-[18px] font-black">Free</p>
              <p className="text-xs text-gray-400">For basic players</p>
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
              <p className="text-[#3c82f4] text-[18px] font-black">Player Pro</p>
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
          <div className="absolute top-0 right-0 bg-gray-700 text-[#ffffff] text-xs font-bold px-3 py-1 rounded-bl-xl">For leagues</div>
          <div className="flex items-center justify-between mb-2 pr-24">
            <div>
              <p className="text-white font-black text-[18px]">Commissioner</p>
              <p className="text-xs text-[#ffffff]">Run a full league or tournament</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black text-white">{commDisplay}</p>
              <p className="text-xs text-[#ffffff]">/month</p>
            </div>
          </div>
          <div className="space-y-1">
            {['Everything in Player Pro', 'A-Z League Management', 'Bracket Generation Tool', 'In-Game Scorekeeping', 'Tournaments Mode', 'League Drafts'].map(f => (
              <div key={f} className="flex items-center gap-2 text-xs text-[#ffffff]">
                <Check className="w-3.5 h-3.5 text-[#ffffff]" /> {f}
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
