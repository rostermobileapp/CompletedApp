import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, LockKeyhole, RefreshCw, ShieldCheck, UsersRound } from "lucide-react";
import { HS_CONSENT_TEXT, HS_CONSENT_VERSION, HS_MAX_FAMILY_PLAYERS } from "@shared/highSchoolOnboarding";
import type { FamilyPlayer, FamilyRequest, FamilySetupState } from "@shared/highSchoolFamilySetup";
import ParentVerification from "@/pages/ParentVerification";
import { parentVerificationSession } from "@/lib/parentVerificationSession";
import { teamRequestSignal } from "@/lib/teamRequestScope";
import { ApiError } from "@/lib/queryClient";
import { FAMILY_API, familyRequest, type FamilyRequestFn } from "@/lib/familySetupApi";
import "@/components/high-school-onboarding/onboarding.css";
import "./family-setup.css";

type FamilySetupProps = {
  request?: FamilyRequestFn;
  onExit: () => void;
  onTeamChange: (teamId: string) => void;
};
type JoinMode = "code" | "invitation";
type AuthorityFailure = "PARENT_VERIFICATION_REQUIRED" | "INVALID_SESSION" | "FAMILY_ELIGIBILITY_REQUIRED" | "";
const INVITATION_TOKEN = /^[A-Za-z0-9_-]{32,128}$/;

function apiErrorCode(error: unknown) {
  return error instanceof ApiError ? error.data?.code : (error as { code?: string })?.code;
}

function errorMessage(error: unknown) {
  const code = apiErrorCode(error);
  const known: Record<string, string> = {
    FAMILY_NOT_ENROLLED: "Family setup is not enrolled for this account. Refresh and try again.",
    PARENT_VERIFICATION_REQUIRED: "Parent verification is required. Verify again before continuing.",
    PARENT_PROOF_REQUIRED: "Parent verification expired. Verify again before continuing.",
    INVALID_SESSION: "Your sign-in session is no longer valid. Return to your account and sign in again.",
    DEV_FIXTURE_REQUIRED: "This family setup is available only to an eligible development account.",
    DEV_FAMILY_INSTALL_REQUIRED: "Family setup is not installed in this environment. Contact the administrator.",
    EXISTING_ADULT_ACCOUNT_REQUIRED: "Family setup requires an existing adult account. Your current account was not changed.",
    FAMILY_DOB_REQUIRED: "Add your date of birth in your profile before starting family setup.",
    FAMILY_DOB_INVALID: "Your profile needs a valid date of birth before you can use family setup.",
    FAMILY_AGE_REQUIRED: "Family setup is available to accounts aged 21 or older based on their recorded date of birth.",
    INVALID_REVISION: "Setup changed in another session. Refresh to continue with the latest version.",
    DRAFT_CONFLICT: "Setup changed in another session. Refresh to continue with the latest version.",
    REQUEST_ALREADY_SUBMITTED: "This draft has already been submitted. Refresh to see the current request status.",
    IMPORT_REVIEW_REQUIRED: "Team-staged player details must be reviewed through the invitation flow.",
    UNSUBMITTED_DRAFT: "Finish or discard the current draft before starting another child.",
    DUPLICATE_PLAYER: "That child is already included in this household or has a team request.",
    HOUSEHOLD_LIMIT: `A household can include up to ${HS_MAX_FAMILY_PLAYERS} unique children.`,
    INVALID_TEAM_CODE: "That team code was not recognized. Check the code with the coach.",
    INVALID_INVITATION: "That invitation token is not valid. Enter the token itself, not a link.",
    LOOK_UP_INVITATION_FIRST: "Match this invitation before sending the team request.",
    INVITATION_REQUIRED: "This child was staged from an invitation. Use that invitation to submit the request.",
    INVITATION_PLAYER_MISMATCH: "The staged player details no longer match this invitation. Refresh and match it again.",
    PLAYER_ALREADY_CLAIMED: "That invited player is already linked to another family.",
    PLAYER_ALREADY_SUBMITTED: "This child already has a team request. Refresh to see its status.",
    PLAYER_CONSENT_REQUIRED: "Review consent for every child and confirm you are their authorized guardian.",
    PLAYER_REVIEW_FORBIDDEN: "This request cannot be reviewed by your current account.",
    STAFF_TEAM_FORBIDDEN: "Your staff access no longer includes this team.",
    STAFF_MANAGEMENT_FORBIDDEN: "Your account does not have authority to manage team requests.",
    DECISION_ALREADY_RECORDED: "This request has already been reviewed. Refresh to see its latest status.",
    INVALID_PLAYER: "Check the child details and try again.",
  };
  if (code && known[code]) return known[code];
  if (error instanceof ApiError && error.data?.message) return String(error.data.message);
  if (error instanceof Error && error.name === "AbortError") return "";
  return "We couldn't complete that family setup request. Your existing adult team is unchanged. Try again.";
}

function freshPlayer(): FamilyPlayer {
  return {
    id: crypto.randomUUID(),
    firstName: "",
    lastName: "",
    gradYear: new Date().getFullYear() + 4,
    position: "F",
    jerseyNumber: "",
    consent: false,
    consentVersion: HS_CONSENT_VERSION,
    photoConsent: false,
    publicNameConsent: false,
  };
}

function requestPlayerKeys(requests: FamilyRequest[]) {
  const keys = new Set<string>();
  for (const request of requests) {
    keys.add(request.playerKey);
    if (request.details?.id) keys.add(request.details.id);
  }
  return keys;
}

function submittedPlayerKeys(requests: FamilyRequest[]) {
  return requestPlayerKeys(requests);
}

function coverageLabel(coverage: FamilyRequest["coverage"]) {
  if (coverage === "personal") return "Personal coverage";
  if (coverage === "league") return "League coverage";
  return "No coverage assigned";
}

function statusLabel(status: FamilyRequest["status"]) {
  if (status === "approved") return "Approved";
  if (status === "denied") return "Declined";
  return "Waiting for team approval";
}

function getScopedSignal(root: AbortController) {
  const scope = teamRequestSignal();
  if (scope.aborted) root.abort();
  else scope.addEventListener("abort", () => root.abort(), { once: true });
  return root.signal;
}

export function FamilySetup({
  request = familyRequest,
  onExit,
  onTeamChange,
}: FamilySetupProps) {
  const queryClient = useQueryClient();
  const verificationRevision = useSyncExternalStore(
    parentVerificationSession.subscribe,
    parentVerificationSession.snapshot,
    parentVerificationSession.snapshot,
  );
  const [state, setState] = useState<FamilySetupState | null>(null);
  const [players, setPlayers] = useState<FamilyPlayer[]>([]);
  const [guardian, setGuardian] = useState(false);
  const [teamCode, setTeamCode] = useState("");
  const [invitationToken, setInvitationToken] = useState("");
  const [joinMode, setJoinMode] = useState<JoinMode>("code");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [authorityFailure, setAuthorityFailure] = useState<AuthorityFailure>("");
  const busyRef = useRef(false);
  const rootRef = useRef<AbortController | null>(null);
  const loadedOnceRef = useRef(false);
  const requestGenerationRef = useRef(0);

  const handleRequestError = useCallback((reason: unknown) => {
    const code = apiErrorCode(reason);
    const ageDenied = ["FAMILY_DOB_REQUIRED", "FAMILY_DOB_INVALID", "FAMILY_AGE_REQUIRED",
      "EXISTING_ADULT_ACCOUNT_REQUIRED"].includes(code ?? "");
    if (ageDenied || code === "PARENT_VERIFICATION_REQUIRED" || code === "PARENT_PROOF_REQUIRED" || code === "INVALID_SESSION") {
      requestGenerationRef.current += 1;
      if (!ageDenied) parentVerificationSession.clear();
      busyRef.current = false;
      setBusy("");
      setLoading(false);
      setState(null);
      setPlayers([]);
      setGuardian(false);
      setInvitationToken("");
      setTeamCode("");
      setNotice("");
      setError(errorMessage(reason));
      setAuthorityFailure(ageDenied ? "FAMILY_ELIGIBILITY_REQUIRED"
        : code === "INVALID_SESSION" ? "INVALID_SESSION" : "PARENT_VERIFICATION_REQUIRED");
      return;
    }
    setError(errorMessage(reason));
  }, []);

  const loadState = useCallback(async (signal: AbortSignal, syncInputs: boolean) => {
    const generation = requestGenerationRef.current;
    const fresh = await request("GET", `${FAMILY_API}/state`, undefined, signal) as FamilySetupState;
    if (signal.aborted || generation !== requestGenerationRef.current) return;
    setState(fresh);
    if (syncInputs) {
      const sent = submittedPlayerKeys(fresh.requests);
      const drafts = fresh.players.filter(player => !sent.has(player.id));
      setPlayers(drafts);
      setGuardian(fresh.guardianConfirmed);
    }
    setLoaded(true);
    setError("");
    setAuthorityFailure("");
  }, [request]);

  useEffect(() => {
    const root = new AbortController();
    const signal = getScopedSignal(root);
    rootRef.current = root;
    signal.addEventListener("abort", () => {
      if (rootRef.current !== root) return;
      busyRef.current = false;
      setBusy("");
      setState(null);
      setPlayers([]);
      setGuardian(false);
      setInvitationToken("");
      setTeamCode("");
      setError("");
      setNotice("");
      setLoading(false);
    }, { once: true });
    if (signal.aborted) {
      setLoading(false);
      setError("This family setup page is no longer active. Return to your account and open it again.");
      return () => {
        if (rootRef.current === root) rootRef.current = null;
      };
    }
    const returning = loadedOnceRef.current;
    if (returning) {
      busyRef.current = false;
      setBusy("");
      setState(null);
      setPlayers([]);
      setGuardian(false);
      setInvitationToken("");
      setTeamCode("");
      setNotice("");
      setError("");
    }
    setLoading(true);
    void loadState(signal, true)
      .catch(reason => {
        if (!signal.aborted) handleRequestError(reason);
      })
      .finally(() => {
        if (!signal.aborted) {
          loadedOnceRef.current = true;
          setLoading(false);
        }
      });
    return () => {
      if (rootRef.current === root) rootRef.current = null;
      root.abort();
      busyRef.current = false;
    };
  }, [verificationRevision, loadState, handleRequestError]);

  const refresh = useCallback(async (syncInputs = false) => {
    const signal = rootRef.current?.signal;
    if (!signal || signal.aborted) return;
    setLoading(true);
    setError("");
    try {
      await loadState(signal, syncInputs);
    } catch (reason) {
      if (!signal.aborted) handleRequestError(reason);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [handleRequestError, loadState]);

  const runMutation = useCallback(async (
    label: string,
    path: string,
    body: unknown,
    successMessage?: string,
    invalidationPrefixes?: string[],
    syncInputs = true,
  ) => {
    if (busyRef.current || !state) return false;
    const signal = rootRef.current?.signal;
    if (!signal || signal.aborted) return false;
    const generation = requestGenerationRef.current;
    busyRef.current = true;
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await request("POST", `${FAMILY_API}/${path}`, body, signal);
      if (signal.aborted || generation !== requestGenerationRef.current) return false;
      for (const prefix of invalidationPrefixes ?? []) {
        await queryClient.invalidateQueries({ queryKey: [prefix] });
      }
      await loadState(signal, syncInputs);
      if (!signal.aborted && generation === requestGenerationRef.current && successMessage) setNotice(successMessage);
      return !signal.aborted && generation === requestGenerationRef.current;
    } catch (reason) {
      if (!signal.aborted) handleRequestError(reason);
      return false;
    } finally {
      if (!signal.aborted) {
        busyRef.current = false;
        setBusy("");
      }
    }
  }, [handleRequestError, loadState, queryClient, request, state]);

  const submittedKeys = useMemo(() => requestPlayerKeys(state?.requests ?? []), [state?.requests]);
  const draftPlayers = useMemo(
    () => players.filter(player => !submittedKeys.has(player.id)),
    [players, submittedKeys],
  );
  const savedDraftPlayers = useMemo(
    () => (state?.players ?? []).filter(player => !submittedKeys.has(player.id)),
    [state?.players, submittedKeys],
  );
  const knownChildren = useMemo(() => {
    const keys = new Set((state?.requests ?? []).map(item => item.playerKey || item.details?.id).filter(Boolean));
    for (const player of state?.players ?? []) {
      if (!submittedKeys.has(player.id)) keys.add(player.id);
    }
    return keys.size;
  }, [state?.players, state?.requests, submittedKeys]);
  const localNewCount = draftPlayers.filter(player => !state?.players.some(saved => saved.id === player.id)).length;
  const totalChildren = knownChildren + localNewCount;
  const detailsValid = draftPlayers.length > 0 && draftPlayers.every(player =>
    player.firstName.trim().length > 0 && player.lastName.trim().length > 0,
  );
  const canSaveConsent = detailsValid && draftPlayers.every(player => player.consent) && guardian;
  const hasSavedConsent = savedDraftPlayers.length > 0
    && state?.guardianConfirmed === true
    && savedDraftPlayers.every(player => player.consent);

  const changePlayer = (id: string, patch: Partial<FamilyPlayer>) => {
    setPlayers(current => current.map(player => player.id === id
      ? { ...player, ...patch, ...(Object.keys(patch).some(key => key !== "consent") ? { consent: false } : {}) }
      : player));
  };

  const begin = () => runMutation(
    "begin",
    "begin",
    {},
    "Family protection is enrolled. Verify parent access to continue.",
    ["team-skin-context", "dev-parent-verification-status", "dev-hs-onboarding"],
  );

  const saveDraft = () => runMutation(
    "draft",
    "draft",
    { revision: state?.revision, players: draftPlayers.map(player => ({ ...player, consent: false })) },
    "Draft saved. Guardian confirmation and child consent must be completed again before joining.",
  );

  const saveConsent = () => runMutation(
    "consent",
    "consent",
    {
      revision: state?.revision,
      players: draftPlayers.map(player => ({ ...player, consent: true })),
      guardianConfirmed: true,
    },
    "Child privacy choices saved. Team access still depends on team approval.",
  );

  const discardDraft = async () => {
    if (!state || !savedDraftPlayers.length || busyRef.current) return;
    if (!window.confirm(state.imported
      ? "Discard this matched invitation draft? The team's staged player and submitted requests will not be changed."
      : "Discard all unsubmitted child drafts? Submitted team requests will not be changed.")) return;
    const discarded = await runMutation("draft", "draft", { revision: state.revision, players: [] },
      "Unsubmitted drafts discarded. Submitted team requests were left unchanged.");
    if (discarded) { setInvitationToken(""); setTeamCode(""); setJoinMode("code"); }
  };

  const lookupInvitation = async () => {
    if (!state || busyRef.current) return;
    const token = invitationToken.trim();
    if (!INVITATION_TOKEN.test(token)) {
      setError("Enter the bare invitation token (32–128 letters, numbers, underscores or hyphens), not a link.");
      return;
    }
    if (savedDraftPlayers.length && !state.imported
      && !window.confirm("Matching this invitation replaces the current unsubmitted draft details. Continue?")) return;
    setJoinMode("invitation");
    await runMutation("lookup", "lookup", { revision: state.revision, invitation: token },
      "Invitation matched. Review and confirm consent again before requesting team access.");
  };

  const joinTeam = async () => {
    if (!state || busyRef.current || !hasSavedConsent) return;
    if (joinMode === "code") {
      const code = teamCode.trim();
      if (code.length < 4 || code.length > 80) {
        setError("Enter a team code between 4 and 80 characters.");
        return;
      }
      await runMutation("join", "join", { revision: state.revision, teamCode: code },
        "Join request submitted. Team staff must approve access; no child account or device was activated.");
    } else {
      const token = invitationToken.trim();
      if (!INVITATION_TOKEN.test(token)) {
        setError("Enter the bare invitation token (32–128 letters, numbers, underscores or hyphens), not a link.");
        return;
      }
      await runMutation("join", "join", { revision: state.revision, invitation: token },
        "Join request submitted. Team staff must approve access; no child account or device was activated.");
    }
  };

  const createAnother = () => runMutation(
    "new-draft",
    "new-draft",
    { revision: state?.revision },
    "A new child draft is ready.",
  );

  const viewTeam = async (teamId: string) => {
    const signal = rootRef.current?.signal;
    if (!signal || signal.aborted) return;
    setBusy(`team-${teamId}`);
    try {
      await queryClient.invalidateQueries({ queryKey: ["team-skin-context"] });
      if (!signal.aborted) onTeamChange(teamId);
    } catch (reason) {
      if (!signal.aborted) setError(errorMessage(reason));
    } finally {
      if (!signal.aborted) setBusy("");
    }
  };

  if (authorityFailure === "PARENT_VERIFICATION_REQUIRED") {
    return <div className="hsy family-setup">
      <div className="family-topline">
        <span className="family-brand">Roster · Family setup</span>
        <button className="family-quiet-button" onClick={onExit}>Back to my account</button>
      </div>
      <div className="family-error-block"><div className="hsy-alert" role="status">Parent verification is required. Child details and invitation tokens have been cleared from this screen.</div></div>
      <ParentVerification enrolled />
      <div className="family-topline" style={{ justifyContent: "center", borderTop: "1px solid var(--family-line)", borderBottom: 0 }}>
        <button className="family-quiet-button" disabled={loading} onClick={() => void refresh(false)}>
          {loading ? "Checking status…" : "Refresh verification status"}
        </button>
      </div>
    </div>;
  }

  if (authorityFailure === "INVALID_SESSION" || authorityFailure === "FAMILY_ELIGIBILITY_REQUIRED") {
    return <div className="hsy family-setup">
      <div className="family-topline">
        <span className="family-brand">Roster · Family setup</span>
        <button className="family-quiet-button" onClick={onExit}>Back to my account</button>
      </div>
      <section className="hsy-content">
        <div className="family-intro-mark" />
        <div className="hsy-section-label">{authorityFailure === "INVALID_SESSION" ? "Session ended" : "Eligibility required"}</div>
        <h1>Family details are locked</h1>
        <p className="hsy-subtitle">{authorityFailure === "INVALID_SESSION"
          ? "Your sign-in session is no longer valid. Child details, consent and invitation tokens have been cleared. Return to your account and sign in again."
          : "Family setup requires a valid recorded date of birth showing age 21 or older. Child details, consent and invitation tokens have been cleared from this screen. Your adult account has not been changed."}</p>
        {error && <div className="hsy-error" role="alert">{error}</div>}
        <button className="hsy-primary" style={{ marginTop: 16 }} disabled={loading} onClick={() => void refresh(false)}>Retry status</button>
      </section>
    </div>;
  }

  if (state?.started && !state.verified) {
    return <div className="hsy family-setup">
      <div className="family-topline">
        <span className="family-brand">Roster · Family setup</span>
        <button className="family-quiet-button" onClick={onExit}>Back to my account</button>
      </div>
      <div className="family-error-block" aria-live="polite">
        {error && <div className="hsy-error" role="alert">{error}</div>}
      </div>
      <ParentVerification enrolled />
      <div className="family-topline" style={{ justifyContent: "center", borderTop: "1px solid var(--family-line)", borderBottom: 0 }}>
        <button className="family-quiet-button" disabled={loading} onClick={() => void refresh(false)}>
          {loading ? "Checking status…" : "Refresh verification status"}
        </button>
      </div>
    </div>;
  }

  const pageContent = () => {
    if (loading && !loaded) {
      return <section className="hsy-content" aria-label="Loading family setup">
        <div className="family-intro-mark" />
        <div className="hsy-section-label">Family setup</div>
        <h1>Loading your setup</h1>
        <p className="hsy-subtitle">Checking only the current household request.</p>
        <div className="family-busy-line" />
        <div className="family-panel soft" style={{ marginTop: 18 }}>
          <div style={{ height: 14, width: "44%", background: "#e8eff0", borderRadius: 8 }} />
          <div style={{ height: 12, width: "78%", background: "#edf2f3", borderRadius: 8, marginTop: 13 }} />
        </div>
      </section>;
    }
    if (!state) {
      return <section className="hsy-content">
        <div className="family-intro-mark" />
        <div className="hsy-section-label">Family setup</div>
        <h1>Could not load family setup</h1>
        <p className="hsy-subtitle">Your regular account and adult team remain unchanged.</p>
        <div className="family-empty"><strong>Nothing has been changed.</strong><p>Retry to check the current family setup state.</p></div>
        <button className="hsy-primary" style={{ marginTop: 16 }} disabled={loading} onClick={() => void refresh(true)}>Retry</button>
      </section>;
    }
    if (!state.started) {
      return <section className="hsy-content">
        <div className="family-intro-mark" />
        <span className="hsy-section-label">A separate path for your family</span>
        <h1>Set up a school-team player</h1>
        <p className="hsy-subtitle">Keep your adult roster. Add a child only when you are ready, with parent verification and clear team approval.</p>
        <div className="family-panel soft">
          <div className="family-kicker">Your account stays yours</div>
          <h2 style={{ marginTop: 8 }}>Family setup does not replace your team</h2>
          <p className="hsy-note">This starts family protection only. It does not enroll children, create child accounts, or activate a device.</p>
        </div>
        <div className="family-form-stack">
          <div className="family-panel">
            <div className="family-kicker">Before you begin</div>
            <p className="hsy-note">Starting family protection adds parent email verification to this login, including access to your adult account. Verification email delivery is disabled in this DEV phase.</p>
            <div className="family-meta-row" style={{ marginTop: 12 }}>
              <span><ShieldCheck size={15} style={{ verticalAlign: "-3px", marginRight: 4 }} />Parent email verification</span>
              <span><UsersRound size={15} style={{ verticalAlign: "-3px", marginRight: 4 }} />Up to {HS_MAX_FAMILY_PLAYERS} players</span>
              <span><LockKeyhole size={15} style={{ verticalAlign: "-3px", marginRight: 4 }} />No child email or phone</span>
            </div>
          </div>
          <button className="hsy-primary" disabled={busy !== ""} onClick={() => void begin()}>
            {busy === "begin" ? "Starting family protection…" : "Start family setup"}
          </button>
          <p className="hsy-footer-note" style={{ marginTop: 0 }}>Free to set up. No purchase is required or made here.</p>
        </div>
      </section>;
    }

    const requests = state.requests ?? [];
    const editablePlayers = state.imported ? [] : draftPlayers;
    const sent = submittedKeys;
    const draftRows = (state.players ?? []).filter(player => !sent.has(player.id));
    const addedCount = totalChildren;
    const mayCreateNew = requests.length > 0 && state.status !== "draft"
      && draftRows.length === 0 && addedCount < state.maximumPlayers;
    const dirty = !state.imported && (editablePlayers.length !== savedDraftPlayers.length
      || editablePlayers.some(player => {
        const saved = savedDraftPlayers.find(item => item.id === player.id);
        return !saved || saved.firstName !== player.firstName || saved.lastName !== player.lastName
          || saved.gradYear !== player.gradYear || saved.position !== player.position
          || saved.jerseyNumber !== player.jerseyNumber;
      }));
    const consentPlayers = state.imported ? draftPlayers : editablePlayers;

    return <section className="hsy-content">
      <div className="family-intro-mark" />
      <div className="hsy-between" style={{ alignItems: "flex-start", marginBottom: 7 }}>
        <span className="hsy-section-label">Family setup · Parent verified</span>
        <span className="family-kicker">{addedCount} of {state.maximumPlayers} children</span>
      </div>
      <h1>Your family, your pace</h1>
      <p className="hsy-subtitle">Save a draft, review consent for each child, then send a team request. Your adult team is separate.</p>
      {state.imported && <div className="hsy-alert" role="status">These player details were staged by the team and are read-only here. Matching and consent do not change the server-owned identity.</div>}

      <div className="family-panel soft" style={{ marginBottom: 17 }}>
        <div className="hsy-between">
          <div>
            <div className="family-kicker">Private by default</div>
            <p className="hsy-note" style={{ marginBottom: 0 }}>No child email, phone, address or birthday is collected. Names stay hidden until parent verification.</p>
          </div>
          <ShieldCheck size={23} color="#176e71" aria-hidden="true" />
        </div>
      </div>

      <div className="hsy-between" style={{ marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Child details</h2>
        <button className="family-quiet-button" disabled={loading || busy !== ""} onClick={() => void refresh(false)}>
          <RefreshCw size={15} style={{ verticalAlign: "-3px", marginRight: 5 }} />Refresh status
        </button>
      </div>

      {state.imported && state.players.length > 0 && <div className="family-panel soft">
        <strong>Team-staged player</strong>
        <p className="hsy-note">{state.players.length} player detail{state.players.length === 1 ? "" : "s"} on file. Details are managed by the team and cannot be edited here.</p>
        {state.status === "draft" && draftRows.length > 0 && <>
          <p className="hsy-note">If this invitation is no longer suitable, discard its draft to start again. This will not change the team's staged record or submitted requests.</p>
          <button className="family-remove" disabled={busy !== ""} onClick={() => void discardDraft()}>Discard invitation draft</button>
        </>}
      </div>}

      {!state.imported && editablePlayers.length === 0 && <div className="family-empty">
        <strong>No child draft yet</strong>
        <p>Add a child when you are ready. Names can be saved as an incomplete draft.</p>
        {(requests.length === 0 || state.status === "draft") && <button className="hsy-secondary" disabled={addedCount >= state.maximumPlayers || busy !== ""} style={{ marginTop: 14 }} onClick={() => setPlayers([freshPlayer()])}>Add a child</button>}
        {requests.length > 0 && state.status !== "draft" && addedCount < state.maximumPlayers && <p className="hsy-note" style={{ marginTop: 12 }}>Start a new draft below to add another child. Existing requests stay in place.</p>}
        {savedDraftPlayers.length > 0 && <button className="family-remove" style={{ display: "block", margin: "8px auto 0" }} disabled={busy !== ""} onClick={() => void discardDraft()}>Discard saved draft</button>}
      </div>}

      {!state.imported && editablePlayers.length > 0 && <div className="family-form-stack">
        {editablePlayers.map((player, index) => <fieldset className="family-panel family-player-card" key={player.id}>
          <legend className="family-kicker" style={{ padding: "0 5px" }}>Player {index + 1}</legend>
          <div className="family-grid-two hsy-grid2">
            <label className="family-field-label">First name
              <input className="hsy-field" maxLength={80} value={player.firstName} disabled={busy !== ""} onChange={event => changePlayer(player.id, { firstName: event.target.value })} />
            </label>
            <label className="family-field-label">Last name
              <input className="hsy-field" maxLength={80} value={player.lastName} disabled={busy !== ""} onChange={event => changePlayer(player.id, { lastName: event.target.value })} />
            </label>
          </div>
          <div className="family-grid-two hsy-grid2" style={{ marginTop: 12 }}>
            <label className="family-field-label">Graduation year
              <select className="hsy-field" value={player.gradYear} disabled={busy !== ""} onChange={event => changePlayer(player.id, { gradYear: Number(event.target.value) })}>
                {Array.from({ length: 15 }, (_, index) => 2026 + index).map(year => <option key={year} value={year}>{year}</option>)}
              </select>
            </label>
            <label className="family-field-label">Jersey number <span style={{ color: "var(--family-muted)", fontWeight: 400 }}>(optional)</span>
              <input className="hsy-field" inputMode="numeric" maxLength={2} value={player.jerseyNumber} disabled={busy !== ""} onChange={event => changePlayer(player.id, { jerseyNumber: event.target.value.replace(/\D/g, "").slice(0, 2) })} />
            </label>
          </div>
          <div className="family-field-label" style={{ marginTop: 12 }}>Position</div>
          <div className="hsy-inline-choice" role="group" aria-label={`Position for player ${index + 1}`}>
            {([["F", "Forward"], ["D", "Defense"], ["G", "Goalie"]] as const).map(([value, label]) =>
              <button type="button" key={value} disabled={busy !== ""} className={player.position === value ? "active" : ""} aria-pressed={player.position === value} onClick={() => changePlayer(player.id, { position: value })}>{label}</button>,
            )}
          </div>
          <button className="family-remove" type="button" disabled={busy !== ""} onClick={() => setPlayers(current => current.filter(item => item.id !== player.id))}>Remove this child</button>
        </fieldset>)}
        {addedCount < state.maximumPlayers && editablePlayers.length < state.maximumPlayers && <button className="hsy-secondary" disabled={busy !== ""} onClick={() => setPlayers(current => [...current, freshPlayer()])}>Add another child</button>}
        <button className="hsy-secondary" style={{ width: "100%" }} disabled={busy !== "" || !dirty} onClick={() => void saveDraft()}>{busy === "draft" ? "Saving draft…" : "Save draft"}</button>
        {savedDraftPlayers.length > 0 && <button className="family-remove" type="button" disabled={busy !== ""} onClick={() => void discardDraft()}>Discard all unsubmitted drafts</button>}
        {dirty && <p className="hsy-note" style={{ margin: 0 }}>Save the latest details as a draft before giving consent. Saving a draft resets guardian confirmation and all child consent.</p>}
      </div>}

      {consentPlayers.length > 0 && <div className="family-panel" style={{ marginTop: 16 }}>
        <div className="family-kicker">Consent for each child</div>
        <p className="hsy-note">Your choices apply separately to each child. Parent or legal guardian consent is required before a team request.</p>
        {state.imported && <p className="hsy-note">Team-provided identity details are read-only. Only the privacy choices and guardian consent below can be submitted.</p>}
        <div className="family-privacy-copy">{HS_CONSENT_TEXT}</div>
        {consentPlayers.map((player, index) => <div className="family-consent-list" key={`consent-${player.id}`}>
          <strong>{player.firstName.trim() || `Player ${index + 1}`} · privacy choices</strong>
          <label className="hsy-toggle"><input type="checkbox" disabled={busy !== "" || (dirty && !state.imported)} checked={player.photoConsent} onChange={event => changePlayer(player.id, { photoConsent: event.target.checked })} />Allow this player’s photo to be shown to their team</label>
          <label className="hsy-toggle"><input type="checkbox" disabled={busy !== "" || (dirty && !state.imported)} checked={player.publicNameConsent} onChange={event => changePlayer(player.id, { publicNameConsent: event.target.checked })} />Allow this player’s name in public results</label>
          <label className="hsy-toggle"><input type="checkbox" disabled={busy !== "" || (dirty && !state.imported)} checked={player.consent} onChange={event => setPlayers(current => current.map(item => item.id === player.id ? { ...item, consent: event.target.checked } : item))} />I am this player’s parent or legal guardian, and I agree to the privacy terms.</label>
        </div>)}
        <label className="hsy-toggle" style={{ marginTop: 14, padding: 12, border: "1px solid var(--family-line)", borderRadius: 12 }}>
          <input type="checkbox" disabled={busy !== "" || (dirty && !state.imported)} checked={guardian} onChange={event => setGuardian(event.target.checked)} />
          I am the authorized adult guardian for these players.
        </label>
        <button className="family-quiet-button" style={{ paddingLeft: 0, marginTop: 8 }} disabled={busy !== "" || (dirty && !state.imported) || !canSaveConsent} onClick={() => void saveConsent()}>
          Save child consent
        </button>
      </div>}

      <div className="family-panel" style={{ marginTop: 18 }}>
        <div className="family-kicker">Connect to a team</div>
        <h2 style={{ marginTop: 7 }}>Use an invitation or team code</h2>
        <p className="hsy-note">Invitations match saved player details. A team code sends a request for staff review.</p>
        <div className="hsy-inline-choice" style={{ marginTop: 13 }} role="group" aria-label="Join method">
          <button type="button" className={joinMode === "code" ? "active" : ""} aria-pressed={joinMode === "code"} onClick={() => setJoinMode("code")}>Team code</button>
          <button type="button" className={joinMode === "invitation" ? "active" : ""} aria-pressed={joinMode === "invitation"} onClick={() => setJoinMode("invitation")}>Invitation</button>
        </div>
        {joinMode === "code" ? <label className="family-field-label" style={{ marginTop: 13 }}>Team code
          <input className="hsy-field" value={teamCode} maxLength={80} autoComplete="off" disabled={busy !== ""} placeholder="Enter the code from your team" onChange={event => setTeamCode(event.target.value)} />
        </label> : <>
          <label className="family-field-label" style={{ marginTop: 13 }}>Bare invitation token
            <input className="hsy-field" value={invitationToken} maxLength={128} autoComplete="off" spellCheck={false} disabled={busy !== ""} placeholder="Paste the token, not the invitation URL" onChange={event => setInvitationToken(event.target.value.trim())} />
          </label>
          <button className="hsy-secondary" style={{ marginTop: 9 }} disabled={busy !== "" || dirty || !invitationToken.trim()} onClick={() => void lookupInvitation()}>
            {busy === "lookup" ? "Matching invitation…" : "Match invitation"}
          </button>
        </>}
        {hasSavedConsent && <button className="hsy-primary" style={{ marginTop: 14 }} disabled={busy !== "" || (joinMode === "code" ? teamCode.trim().length < 4 : !INVITATION_TOKEN.test(invitationToken.trim()))} onClick={() => void joinTeam()}>
          {busy === "join" ? "Submitting request…" : "Request team access"}
        </button>}
        {!hasSavedConsent && <p className="hsy-note" style={{ marginBottom: 0 }}>Save current child details and guardian consent before submitting a team request.</p>}
      </div>

      <section style={{ marginTop: 25 }}>
        <div className="hsy-between" style={{ alignItems: "baseline" }}>
          <h2 style={{ margin: 0, fontSize: 19 }}>Setup status</h2>
          <span className="family-kicker">{requests.length} team request{requests.length === 1 ? "" : "s"}</span>
        </div>
        {draftRows.map((player, index) => <article className="family-request" key={`draft-${player.id}`} style={{ marginTop: 11 }}>
          <div className="family-request-top">
            <span className="family-request-name">{player.firstName.trim() || `Player ${index + 1}`} {player.lastName.trim()}</span>
            <span className="family-status draft">Draft</span>
          </div>
          <div className="family-meta-row">{player.gradYear} · {player.position === "F" ? "Forward" : player.position === "D" ? "Defense" : "Goalie"}</div>
          <div className="family-device-state"><span>Device access</span><strong>Disabled</strong></div>
        </article>)}
        {requests.length === 0 && draftRows.length === 0 && <div className="family-empty" style={{ marginTop: 11 }}>
          <strong>No team requests yet</strong><p>Child profiles are created only after a team approves a request.</p>
        </div>}
        {requests.map(item => <FamilyRequestCard key={item.id} request={item} busy={busy === `team-${item.teamId}`} onViewTeam={() => void viewTeam(item.teamId)} />)}
      </section>

      {mayCreateNew && <div className="family-panel soft" style={{ marginTop: 15 }}>
        <div className="hsy-between">
          <div><strong>Add another child</strong><p className="hsy-note" style={{ marginBottom: 0 }}>You can have up to {state.maximumPlayers} unique children across drafts and team requests.</p></div>
          <button className="hsy-secondary" disabled={busy !== ""} onClick={() => void createAnother()}>{busy === "new-draft" ? "Starting…" : "New child draft"}</button>
        </div>
      </div>}

      <div className="family-panel soft" style={{ marginTop: 18 }}>
        <div className="family-kicker">What happens next</div>
        <p className="hsy-note" style={{ marginBottom: 0 }}>Team approval is separate from coverage. A successful request never activates a child login or device; device access is disabled.</p>
      </div>
    </section>;
  };

  return <main className="hsy family-setup">
    <div className="family-topline">
      <span className="family-brand">Roster · Family setup</span>
      <div className="family-top-actions">
        <button className="family-quiet-button" disabled={loading} onClick={() => void refresh(false)} aria-label="Refresh family setup status">
          <RefreshCw size={15} style={{ verticalAlign: "-3px", marginRight: 4 }} />Refresh
        </button>
        <button className="family-quiet-button" onClick={onExit} aria-label="Back to my account"><ChevronLeft size={16} style={{ verticalAlign: "-3px" }} />My account</button>
      </div>
    </div>
    {busy && <div className="family-busy-line" aria-label="Saving changes" />}
    <div className="hsy-frame">
      {error && <div className="family-error-block"><div className="hsy-error" role="alert">{error}<button className="family-quiet-button" style={{ float: "right", minHeight: 30 }} onClick={() => setError("")}>Dismiss</button></div></div>}
      {notice && <div className="family-error-block"><div className="hsy-success" role="status">{notice}</div></div>}
      {pageContent()}
    </div>
    <div className="family-topline" style={{ justifyContent: "center", borderTop: "1px solid var(--family-line)", borderBottom: 0 }}>
      <button className="family-quiet-button" onClick={onExit}>Return to my adult account</button>
    </div>
  </main>;
}

function FamilyRequestCard({ request, busy, onViewTeam }: {
  request: FamilyRequest;
  busy: boolean;
  onViewTeam: () => void;
}) {
  const statusClass = request.status === "approved" ? "approved" : request.status === "denied" ? "denied" : "pending";
  const name = `${request.details.firstName} ${request.details.lastName}`.trim();
  return <article className="family-request" style={{ marginTop: 11 }}>
    <div className="family-request-top">
      <span className="family-request-name">{name}</span>
      <span className={`family-status ${statusClass}`}>{statusLabel(request.status)}</span>
    </div>
    <div className="family-meta-row">
      <span>{request.details.gradYear} · {request.details.position === "F" ? "Forward" : request.details.position === "D" ? "Defense" : "Goalie"}</span>
      <span>{request.teamName}</span>
    </div>
    <div className="family-request-bottom">
      <span className="family-coverage"><strong>Coverage</strong><br />{coverageLabel(request.coverage)}</span>
        {request.status === "approved" && <button className="family-team-link" disabled={busy} onClick={onViewTeam}>{busy ? "Opening team…" : "View team"}</button>}
    </div>
    <div className="family-device-state"><span>Child sign-in and device access</span><strong>Disabled</strong></div>
  </article>;
}

export default FamilySetup;
