import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronRight, Lock, X } from "lucide-react";
import { apiRequest, ApiError, getImageUrl } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useDemo } from "@/context/DemoContext";
import { hasPaidTrophyCaseAccess } from "@shared/trophyCaseAccess";
import { shouldShowBirthdayGreeting, type BirthdayStatus } from "./birthdayVisibility";
import {
  canStartManualTrivia, isSafeTriviaOpportunity, isValidTriviaQuestion,
  hasServerPatchAccess, readTriviaDismissal, retainQuestionPatch, shouldOfferTrivia,
  shouldRetainTriviaPriority, triviaPlayDestination,
  type TriviaToday, writeTriviaDismissal,
} from "./triviaVisibility";
import "./TriviaHost.css";
import { gradeTriviaChoice, type LocalTriviaResult } from "./triviaGrading";

type TriviaStats = {
  total_answered: number; total_correct: number; accuracy: number;
  current_streak: number; best_streak: number;
  categories: Array<{ category: string; correct_count: number }>;
};
type TriviaPatch = { name?: string; imagePath?: string | null; correct_count?: number; current_tier?: number; next_threshold?: number | null; complete?: boolean };
type TriviaFeedback = {
  is_correct: boolean; correct_index: number; explanation: string; streak: number;
  category: string; correct_count: number; patch?: TriviaPatch & { unlocked_tier?: number; tier?: number };
};
const HOME_OPPORTUNITY = (path: string) => isSafeTriviaOpportunity(path);
const TRIVIA_MODAL_EVENT = "roster:trivia-modal";
const APP_LAUNCH_ID = typeof globalThis.crypto?.randomUUID === "function"
  ? globalThis.crypto.randomUUID()
  : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function fireTriviaModalEvent(open: boolean) {
  window.dispatchEvent(new CustomEvent(TRIVIA_MODAL_EVENT, { detail: { open } }));
}

function responseMessage(error: unknown) {
  return error instanceof Error ? error.message : "We couldn't save that answer. Check your connection and try again.";
}

function getDismissalStorage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

export function TriviaHost() {
  const { user } = useAuth();
  const { isActive: demoActive } = useDemo();
  const [path, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { data: permissionUser } = useQuery<any>({ queryKey: ["/api/user"], enabled: !!user });
  const todayKey = ["/api/trivia/today", user?.id] as const;
  const statsKey = ["/api/trivia/stats", user?.id] as const;
  const [dismissed, setDismissed] = useState(false);
  const [dismissalHydrated, setDismissalHydrated] = useState(false);
  const [choice, setChoice] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<TriviaFeedback | null>(null);
  const [feedbackDate, setFeedbackDate] = useState<string | null>(null);
  const [localResult, setLocalResult] = useState<LocalTriviaResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  submittingRef.current = submitting;
  const lastTriviaDate = useRef<string | null>(null);
  const lastDismissalIdentity = useRef<string | null>(null);
  const lastUserId = useRef<string | null>(user?.id ?? null);
  const currentUserId = useRef<string | null>(user?.id ?? null);
  currentUserId.current = user?.id ?? null;
  const manualOpenRequested = useRef(false);
  const designReviewOpened = useRef(false);
  const triviaEngaged = useRef(false);
  const [submitError, setSubmitError] = useState("");
  const [hasExistingDialog, setHasExistingDialog] = useState(false);
  const todayQuery = useQuery<unknown>({
    queryKey: todayKey,
    queryFn: async () => (await apiRequest("GET", "/api/trivia/today")).json(),
    enabled: !!user && !demoActive,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 60_000,
  });
  const statsQuery = useQuery<TriviaStats>({
    queryKey: statsKey,
    queryFn: async () => (await apiRequest("GET", "/api/trivia/stats")).json(),
    enabled: !!user && !demoActive,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const birthdayQuery = useQuery<BirthdayStatus>({
    queryKey: ["/api/birthday/status", user?.id],
    queryFn: async () => (await apiRequest("GET", "/api/birthday/status")).json(),
    enabled: !!user && !demoActive,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const badgeQuery = useQuery<unknown[]>({
    queryKey: ["/api/badges/events/pending"],
    enabled: !!user && !demoActive,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
  const today = isValidTriviaQuestion(todayQuery.data) ? todayQuery.data : null;
  const currentFeedback = today && feedbackDate === today.date ? feedback : null;
  const displayResult = currentFeedback || (localResult?.date === today?.date ? localResult : null);
  const paid = hasPaidTrophyCaseAccess(permissionUser);
  const eligible = (!todayQuery.isError || !!displayResult) && !!today && (!today.answered || !!displayResult);
  const waitingOnOtherHost = shouldShowBirthdayGreeting(birthdayQuery.data, Date.now(), badgeQuery.data)
    || (Array.isArray(badgeQuery.data) && badgeQuery.data.length > 0)
    || !birthdayQuery.isFetched || !badgeQuery.isFetched;
  const canInitiallyOpen = !!user && !demoActive && eligible && dismissalHydrated && shouldOfferTrivia({
    path,
    answered: !!today?.answered && !displayResult,
    dismissed,
    otherOverlayActive: waitingOnOtherHost || hasExistingDialog,
  });
  const modalOpen = canInitiallyOpen || (!!user && !demoActive && shouldRetainTriviaPriority({
    path, engaged: triviaEngaged.current, eligible, dismissed,
  }));
  const hasAnswer = !!displayResult;
  const categoryCount = useMemo(() => statsQuery.data?.categories?.find((item) => item.category === today?.category)?.correct_count ?? 0, [statsQuery.data, today?.category]);
  const errorStatus = todayQuery.error instanceof ApiError ? todayQuery.error.status : null;

  useEffect(() => {
    if (lastUserId.current === (user?.id ?? null)) return;
    lastUserId.current = user?.id ?? null;
    lastTriviaDate.current = null;
    lastDismissalIdentity.current = null;
    triviaEngaged.current = false;
    setDismissed(false);
    setDismissalHydrated(false);
    setChoice(null);
    setFeedback(null);
    setFeedbackDate(null);
    setLocalResult(null);
    setSubmitError("");
    manualOpenRequested.current = false;
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !today) {
      setDismissalHydrated(false);
      return;
    }
    const identity = `${user.id}:${today.date}`;
    if (lastDismissalIdentity.current === identity) return;
    lastDismissalIdentity.current = identity;
    const storedDismissal = readTriviaDismissal(getDismissalStorage(), user.id, today.date, APP_LAUNCH_ID);
    setDismissed(storedDismissal);
    setDismissalHydrated(true);
  }, [user?.id, today?.date]);

  useEffect(() => {
    const update = () => setHasExistingDialog(
      Array.from(document.querySelectorAll('[role="dialog"], [data-radix-dialog-content]'))
        .some((element) => !element.closest(".trivia-host")),
    );
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["role", "data-state", "aria-modal"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!today) return;
    if (lastTriviaDate.current && lastTriviaDate.current !== today.date) {
      setDismissed(false);
      setChoice(null);
      setFeedback(null);
      setFeedbackDate(null);
      setLocalResult(null);
      setSubmitError("");
    }
    lastTriviaDate.current = today.date;
  }, [today?.date]);

  useEffect(() => {
    if (canInitiallyOpen) triviaEngaged.current = true;
  }, [canInitiallyOpen]);

  useEffect(() => {
    fireTriviaModalEvent(modalOpen);
    if (!modalOpen) return;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submittingRef.current) dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = oldOverflow;
      window.removeEventListener("keydown", onKey);
      fireTriviaModalEvent(false);
    };
  }, [modalOpen]);

  useEffect(() => {
    if (!today || !today.answered || displayResult) return;
    setDismissed(true);
  }, [today?.date, today?.answered, displayResult]);

  // One-time, development-only review requested by the owner. Restore the
  // saved result without resetting an answer or touching earned progress.
  useEffect(() => {
    const reviewKey = "roster.trivia.design-review:1790951555";
    if (!import.meta.env.DEV || Date.now() > 1790952155000 ||
        designReviewOpened.current || permissionUser?.displayId !== "U00001" ||
        !user || demoActive || !dismissalHydrated || !today?.answered ||
        !today.feedback || waitingOnOtherHost || hasExistingDialog) return;
    try { if (window.sessionStorage.getItem(reviewKey)) return; } catch {}
    if (!HOME_OPPORTUNITY(path)) {
      navigate("/");
      return;
    }
    designReviewOpened.current = true;
    try { window.sessionStorage.setItem(reviewKey, "opened"); } catch {}
    triviaEngaged.current = true;
    setChoice(today.chosen_index ?? null);
    setFeedback(today.feedback as TriviaFeedback);
    setFeedbackDate(today.date);
    setDismissed(false);
    console.info("[Trivia] Opened saved result for design review.");
  }, [permissionUser?.displayId, user, demoActive, dismissalHydrated, today,
    waitingOnOtherHost, hasExistingDialog, path, navigate]);

  useEffect(() => {
    const onManualOpen = () => {
      manualOpenRequested.current = true;
      const destination = triviaPlayDestination(path);
      if (destination !== path) {
        navigate(destination);
      } else if (today && canStartManualTrivia({
        path,
        answered: today.answered,
        otherOverlayActive: waitingOnOtherHost || hasExistingDialog,
      })) {
        manualOpenRequested.current = false;
        triviaEngaged.current = true;
        setDismissed(false);
      }
    };
    window.addEventListener("roster:trivia-open", onManualOpen);
    return () => window.removeEventListener("roster:trivia-open", onManualOpen);
  }, [path, navigate, today, waitingOnOtherHost, hasExistingDialog]);

  useEffect(() => {
    if (!manualOpenRequested.current || !HOME_OPPORTUNITY(path) || !today
      || waitingOnOtherHost || hasExistingDialog) return;
    manualOpenRequested.current = false;
    if (canStartManualTrivia({ path, answered: today.answered, otherOverlayActive: waitingOnOtherHost || hasExistingDialog })) {
      triviaEngaged.current = true;
      setDismissed(false);
    }
  }, [path, today?.date, today?.answered, waitingOnOtherHost, hasExistingDialog]);

  useEffect(() => {
    if (!HOME_OPPORTUNITY(path)) triviaEngaged.current = false;
  }, [path]);

  function dismiss() {
    if (submittingRef.current) return;
    triviaEngaged.current = false;
    setDismissed(true);
    setSubmitError("");
    if (user?.id && today?.date) writeTriviaDismissal(getDismissalStorage(), user.id, today.date, APP_LAUNCH_ID);
  }

  async function submitAnswer(index: number) {
    if (!today || submittingRef.current || currentFeedback) return;
    if (localResult?.date === today.date && localResult.chosen_index !== index) return;
    let graded: LocalTriviaResult;
    try {
      graded = gradeTriviaChoice(today, index);
    } catch (error) {
      setSubmitError(responseMessage(error));
      return;
    }
    const submittedByUserId = user?.id;
    setChoice(index);
    // No request is awaited before revealing the result and explanation.
    setLocalResult(graded);
    triviaEngaged.current = true;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError("");
    try {
      const response = await apiRequest("POST", "/api/trivia/answer", {
        chosen_index: index,
        trivia_date: today.date,
      });
      const body = await response.json();
      if (currentUserId.current !== submittedByUserId || lastTriviaDate.current !== today.date) return;
      const rawResult = (body.feedback || body) as TriviaFeedback;
      const questionPatch = (today as TriviaToday & { patch?: TriviaPatch }).patch;
      const mergedPatch = retainQuestionPatch<NonNullable<TriviaFeedback["patch"]>>(questionPatch, rawResult.patch);
      const result = mergedPatch ? { ...rawResult, patch: mergedPatch } : rawResult;
      if (typeof result.is_correct !== "boolean" || typeof result.correct_index !== "number") {
        throw new Error("The answer response was incomplete. Refresh to check today's result.");
      }
      triviaEngaged.current = true;
      setDismissed(false);
      setFeedback(result);
      setFeedbackDate(today.date);
      setLocalResult(null);
      setSubmitting(false);
      // The answer response is authoritative. Refresh other views in the
      // background rather than fetching today's same result a second time.
      queryClient.setQueryData(todayKey, {
        ...today, answered: true, chosen_index: index, feedback: result,
        ...(result.patch ? { patch: result.patch } : {}),
      });
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/trivia/stats"] }),
        ...(paid ? [queryClient.invalidateQueries({ queryKey: ["/api/trivia/patches"] })] : []),
      ]).catch((error) => console.error("[Trivia] Failed to refresh progress:", error));
      if (paid && result.patch?.unlocked_tier) {
        // BadgeEarnedHost owns patch unlock celebrations; let feedback close first.
        window.setTimeout(() => queryClient.invalidateQueries({ queryKey: ["/api/badges/events/pending"] }), 250);
      }
    } catch (error) {
      if (currentUserId.current !== submittedByUserId) return;
      // Reconcile an ambiguous network failure before offering a retry. The API
      // is idempotent per Eastern date; refreshing also catches day rollover.
      await queryClient.invalidateQueries({ queryKey: ["/api/trivia/today"] });
      if (currentUserId.current !== submittedByUserId || lastTriviaDate.current !== today.date) return;
      const reconciled = queryClient.getQueryData<unknown>(todayKey);
      if (isValidTriviaQuestion(reconciled) && reconciled.answered) {
        if (reconciled.feedback) {
          setFeedback(reconciled.feedback as TriviaFeedback);
          setFeedbackDate(reconciled.date);
          setLocalResult(null);
          setDismissed(false);
          setChoice(typeof reconciled.chosen_index === "number" ? reconciled.chosen_index : index);
        } else setDismissed(true);
      } else {
        setSubmitError(`Your result is shown, but saving isn't confirmed. ${responseMessage(error)}`);
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  if (errorStatus === 403) return null;
  if (todayQuery.isError && !displayResult && HOME_OPPORTUNITY(path) && !!user && !demoActive) {
    return <div className="trivia-host fixed bottom-24 left-1/2 z-[10004] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-xl border border-[var(--trivia-edge)] bg-[var(--trivia-surface)] p-4 shadow-xl"><p role="alert" className="text-sm font-semibold">Daily trivia couldn’t load right now.</p><button type="button" onClick={() => void todayQuery.refetch()} className="mt-2 text-sm font-bold text-[var(--trivia-ink)] underline underline-offset-4">Try again</button></div>;
  }
  if (!modalOpen || !today) return null;
  const patch = currentFeedback?.patch || (today as TriviaToday & { patch?: TriviaPatch }).patch;
  const patchAccess = hasServerPatchAccess(paid, patch);
  const image = patchAccess && patch?.imagePath ? getImageUrl(patch.imagePath) : null;
  const count = currentFeedback?.correct_count ?? categoryCount;
  const progressGoal = patch?.next_threshold;
  const progress = progressGoal ? Math.min(100, count / progressGoal * 100) : (patch?.complete ? 100 : 0);

  return (
    <div className="trivia-host trivia-backdrop fixed inset-0 z-[10005] flex items-center justify-center overflow-y-auto p-3 sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) dismiss(); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="trivia-title" className="trivia-panel relative my-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-2xl p-5 sm:p-7">
        <button type="button" onClick={dismiss} disabled={submitting} aria-label="Not now" className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-[var(--trivia-muted)] transition hover:bg-black/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#164a73] disabled:opacity-40"><X size={18} /></button>
        <header className="border-b border-[var(--trivia-edge)] pb-5 pr-10">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#e8f0f6] font-mono text-xs font-bold text-[#164a73] dark:bg-[#28475d] dark:text-[#d4e8f5]">01</span>
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[.2em] text-[#b52732] dark:text-[#ff9aa1]">Daily trivia · {today.difficulty}</p>
              <h2 id="trivia-title" className="mt-0.5 text-xl font-bold leading-tight tracking-tight sm:text-2xl">{today.category}</h2>
            </div>
            {patchAccess && image && <img src={image} alt={`${today.category} patch`} className="ml-auto h-10 w-10 shrink-0 object-contain" />}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-[var(--trivia-muted)]">One question today. Every correct answer adds to your collection.</p>
        </header>
        <p className="mt-5 text-lg font-semibold leading-snug sm:text-xl">{today.question}</p>
        <div role="group" aria-label="Choose one answer" className="mt-5 grid gap-2">
          {today.choices.map((answer, index) => {
            const correct = hasAnswer && index === displayResult?.correct_index;
            const wrong = hasAnswer && choice === index && !displayResult?.is_correct;
            return <button key={`${index}-${answer}`} type="button" disabled={submitting || hasAnswer} onClick={() => void submitAnswer(index)} aria-pressed={choice === index} className={`trivia-choice flex min-h-[3.5rem] items-center gap-3 rounded-lg px-3.5 py-3 text-left text-sm font-semibold text-[var(--trivia-ink)] disabled:hover:translate-y-0 sm:text-base ${correct ? "is-correct" : wrong ? "is-wrong" : submitting && choice === index ? "is-selected" : ""}`}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-current/20 font-mono text-[11px]">{String.fromCharCode(65 + index)}</span>
              <span className="min-w-0 flex-1">{answer}</span>
              {correct && <span className="inline-flex shrink-0 items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.08em]"><Check aria-hidden="true" size={16} />Correct answer</span>}
              {wrong && <span className="inline-flex shrink-0 items-center gap-1.5 text-[10px] font-bold uppercase tracking-[.08em]"><X aria-hidden="true" size={16} />Your answer</span>}
            </button>;
          })}
        </div>
        {submitting && <p role="status" className="mt-3 text-center text-xs font-medium text-[var(--trivia-muted)]">Saving your answer…</p>}
        {submitError && <div className="mt-4 rounded-lg border border-[#e8c8cb] bg-[#fff5f5] p-3 text-sm text-[#78252c] dark:border-[#82444b] dark:bg-[#492b33] dark:text-[#ffe2e3]"><p role="alert">{submitError}</p><button type="button" disabled={submitting} onClick={() => choice !== null ? void submitAnswer(choice) : void todayQuery.refetch().then(() => setSubmitError(""))} className="mt-2 font-bold underline underline-offset-4 disabled:opacity-40">{choice !== null ? "Retry saving answer" : "Reload question"}</button></div>}
        {displayResult && <div aria-live="polite" className="trivia-feedback mt-4 rounded-xl p-4">
          <div className="flex items-center gap-2">
            <span className={`flex h-7 w-7 items-center justify-center rounded-full ${displayResult.is_correct ? "bg-[#dcefe3] text-[#146b43] dark:bg-[#214d38] dark:text-[#83e0ae]" : "bg-[#f8e1e2] text-[#b52732] dark:bg-[#583139] dark:text-[#ff9aa1]"}`}>{displayResult.is_correct ? <Check size={15} aria-hidden="true" /> : <X size={15} aria-hidden="true" />}</span>
            <p className={`font-bold ${displayResult.is_correct ? "text-[#146b43] dark:text-[#83e0ae]" : "text-[var(--trivia-red)]"}`}>{displayResult.is_correct ? "Correct." : "Incorrect."}{currentFeedback && <span className="ml-1.5 font-medium text-[var(--trivia-ink)]">Streak: {currentFeedback.streak} {currentFeedback.streak === 1 ? "day" : "days"}</span>}</p>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-[var(--trivia-muted)]">{displayResult.explanation}</p>
          {currentFeedback && patchAccess && <div className="mt-4">
            <div className="flex items-center justify-between gap-2 text-xs font-bold"><span>{currentFeedback.is_correct ? `+1 toward ${patch?.name || today.category}` : `No progress · ${patch?.name || today.category}`}</span><span className="font-mono">{progressGoal ? `${count} / ${progressGoal}` : `${count} correct`}</span></div>
            {progressGoal && <div className="trivia-progress-track mt-2 h-1.5 overflow-hidden rounded-full"><div className="h-full rounded-full bg-[#d52d3b] transition-[width] duration-500" style={{ width: `${progress}%` }} /></div>}
            {currentFeedback.patch?.unlocked_tier && <p className="mt-2 text-sm font-bold text-[#b52732] dark:text-[#ff9aa1]">Tier {currentFeedback.patch.unlocked_tier} unlocked. Your patch celebration will follow.</p>}
          </div>}
          {currentFeedback && !paid && currentFeedback.is_correct && <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--trivia-muted)]">
            <span>{count} correct in {today.category}. Trivia patches are part of Trophy Case.</span>
            <button type="button" onClick={() => { dismiss(); navigate("/subscription"); }} className="inline-flex min-h-10 items-center gap-1 rounded-md px-2 font-bold text-[#164a73] underline dark:text-[#b9d8ed]">See upgrade options <ChevronRight size={14} /></button>
          </div>}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            {currentFeedback && patchAccess && <button type="button" onClick={() => { dismiss(); navigate(`/trophy-case?triviaCategory=${encodeURIComponent(currentFeedback.category || today.category)}`); }} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-[var(--trivia-edge)] px-4 text-sm font-bold transition hover:bg-black/5"><Lock size={14} />View in Trophy Case</button>}
            <button type="button" onClick={dismiss} disabled={submitting} className="min-h-11 flex-1 rounded-lg bg-[#164a73] px-4 text-sm font-bold text-white transition hover:bg-[#103a5b] disabled:opacity-40">Done</button>
          </div>
        </div>}
        {!hasAnswer && <button type="button" onClick={dismiss} className="mt-3 min-h-10 w-full text-xs font-semibold text-[var(--trivia-muted)] underline underline-offset-4">Not now</button>}
      </section>
    </div>
  );
}

export { TRIVIA_MODAL_EVENT, fireTriviaModalEvent };