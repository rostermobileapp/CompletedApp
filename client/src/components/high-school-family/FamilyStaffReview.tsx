import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { FAMILY_API, familyRequest, type FamilyRequestFn } from "@/lib/familySetupApi";
import { ApiError } from "@/lib/queryClient";
import { parentVerificationSession } from "@/lib/parentVerificationSession";
import { teamRequestSignal } from "@/lib/teamRequestScope";
import "@/components/high-school-onboarding/onboarding.css";
import "./family-setup.css";

type StaffRequest = {
  id: string;
  firstName: string;
  lastName: string;
  gradYear: number;
  position: "F" | "D" | "G";
  status: string;
  teamName: string;
};
type FamilyStaffReviewProps = {
  actorId: string;
  teamId: string;
  onChanged: () => void;
};

function staffErrorMessage(error: unknown) {
  const code = error instanceof ApiError ? error.data?.code : (error as { code?: string })?.code;
  const known: Record<string, string> = {
    PARENT_VERIFICATION_REQUIRED: "Parent verification is required. Verify again before reviewing requests.",
    PARENT_PROOF_REQUIRED: "Parent verification expired. Verify again before reviewing requests.",
    INVALID_SESSION: "Your sign-in session is no longer valid. Return to your account and sign in again.",
    PLAYER_REVIEW_FORBIDDEN: "This request cannot be reviewed by your current account.",
    STAFF_TEAM_FORBIDDEN: "Your staff access no longer includes this team.",
    STAFF_MANAGEMENT_FORBIDDEN: "Your account does not have authority to manage team requests.",
    DECISION_ALREADY_RECORDED: "This request has already been reviewed. Refresh to see its latest status.",
    REQUEST_NOT_FOUND: "This request is no longer available. Refresh the list.",
    INVALID_REVISION: "This review list changed. Refresh before making another decision.",
    NOT_AUTHORIZED: "Your team staff access changed. Refresh to check current permissions.",
  };
  if (code && known[code]) return known[code];
  if (error instanceof ApiError && error.data?.message) return String(error.data.message);
  if (error instanceof Error && error.name === "AbortError") return "";
  return "The child request could not be updated. Refresh the list and try again.";
}

function linkedSignal(root: AbortController) {
  const scope = teamRequestSignal();
  if (scope.aborted) root.abort();
  else scope.addEventListener("abort", () => root.abort(), { once: true });
  return root.signal;
}

function positionName(position: StaffRequest["position"]) {
  return position === "F" ? "Forward" : position === "D" ? "Defense" : "Goalie";
}

export function FamilyStaffReview({ actorId, teamId, onChanged }: FamilyStaffReviewProps) {
  const proofRevision = useSyncExternalStore(
    parentVerificationSession.subscribe,
    parentVerificationSession.snapshot,
    parentVerificationSession.snapshot,
  );
  const [requests, setRequests] = useState<StaffRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [listKey, setListKey] = useState("");
  const rootRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);
  const requestGenerationRef = useRef(0);
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;
  const scopeKey = `${actorId}:${teamId}:${proofRevision}`;
  const path = useMemo(
    () => `${FAMILY_API}/staff/teams/${encodeURIComponent(teamId)}/requests`,
    [teamId],
  );

  const handleRequestError = useCallback((reason: unknown) => {
    const code = reason instanceof ApiError ? reason.data?.code : (reason as { code?: string })?.code;
    if (code === "PARENT_VERIFICATION_REQUIRED" || code === "PARENT_PROOF_REQUIRED" || code === "INVALID_SESSION") {
      requestGenerationRef.current += 1;
      setRequests([]);
      setListKey("");
      setBusyId("");
      setLoading(false);
      busyRef.current = false;
      parentVerificationSession.clear();
    }
    setError(staffErrorMessage(reason));
  }, []);

  const fetchRequests = useCallback(async (
    request: FamilyRequestFn,
    signal: AbortSignal,
    notify: boolean,
  ) => {
    const generation = requestGenerationRef.current;
    const result = await request("GET", path, undefined, signal) as { requests: StaffRequest[] };
    if (signal.aborted || generation !== requestGenerationRef.current) return;
    setRequests(Array.isArray(result?.requests) ? result.requests : []);
    setListKey(scopeKey);
    setError("");
    if (notify) onChangedRef.current();
  }, [path, scopeKey]);

  useEffect(() => {
    const root = new AbortController();
    const signal = linkedSignal(root);
    rootRef.current = root;
    signal.addEventListener("abort", () => {
      if (rootRef.current !== root) return;
      busyRef.current = false;
      setRequests([]);
      setListKey("");
      setBusyId("");
      setError("");
      setLoading(false);
    }, { once: true });
    if (signal.aborted) {
      setLoading(false);
      setError("This team review page is no longer active. Reopen the team space to continue.");
      return () => {
        if (rootRef.current === root) rootRef.current = null;
      };
    }
    setRequests([]);
    setListKey("");
    setError("");
    setBusyId("");
    busyRef.current = false;
    setLoading(true);
    void fetchRequests(familyRequest, signal, false)
      .catch(reason => {
        if (!signal.aborted) handleRequestError(reason);
      })
      .finally(() => {
        if (!signal.aborted) setLoading(false);
      });
    return () => {
      if (rootRef.current === root) rootRef.current = null;
      root.abort();
      busyRef.current = false;
    };
  }, [fetchRequests, handleRequestError]);

  const refresh = async (notify = false) => {
    const signal = rootRef.current?.signal;
    if (!signal || signal.aborted) return;
    setLoading(true);
    setError("");
    try {
      await fetchRequests(familyRequest, signal, notify);
    } catch (reason) {
      if (!signal.aborted) handleRequestError(reason);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  };

  const decide = async (id: string, approve: boolean) => {
    if (busyRef.current) return;
    const signal = rootRef.current?.signal;
    if (!signal || signal.aborted) return;
    const generation = requestGenerationRef.current;
    busyRef.current = true;
    setBusyId(id);
    setError("");
    try {
      await familyRequest("POST", `${path}/${encodeURIComponent(id)}/decision`, { approve }, signal);
      if (signal.aborted || generation !== requestGenerationRef.current) return;
      await fetchRequests(familyRequest, signal, true);
    } catch (reason) {
      if (!signal.aborted) handleRequestError(reason);
    } finally {
      if (!signal.aborted) {
        busyRef.current = false;
        setBusyId("");
      }
    }
  };

  const visibleRequests = listKey === scopeKey ? requests : [];
  const pending = visibleRequests.filter(item => item.status === "pending" || item.status === "pending_staff");
  const other = visibleRequests.filter(item => item.status !== "pending" && item.status !== "pending_staff");

  return <section className="family-staff-review" aria-labelledby="family-staff-review-title">
    <div className="family-staff-heading">
      <div>
        <div className="family-kicker"><ShieldCheck size={14} style={{ verticalAlign: "-3px", marginRight: 5 }} />Parent-approved setup</div>
        <h2 id="family-staff-review-title">Child team requests</h2>
        <p>Approve a player profile only when the family details match your roster.</p>
      </div>
      <button className="family-quiet-button" disabled={loading || !!busyId} onClick={() => void refresh(false)} aria-label="Refresh child team requests">
        <RefreshCw size={15} style={{ verticalAlign: "-3px", marginRight: 4 }} />Refresh
      </button>
    </div>
    {loading && <div className="family-busy-line" aria-label="Loading child requests" />}
    {error && <div className="hsy-error family-staff-error" role="alert">{error}</div>}
    {loading && visibleRequests.length === 0 ? <div className="family-empty">
      <strong>Loading requests</strong><p>Checking the current team review queue.</p>
    </div> : null}
    {!loading && !error && visibleRequests.length === 0 && <div className="family-empty">
      <strong>No child requests waiting</strong><p>New parent-consented requests for this team will appear here.</p>
    </div>}
    {pending.length > 0 && <div className="family-staff-list">
      {pending.map(item => <article className="family-staff-card" key={item.id}>
        <div className="family-request-top">
          <h3>{item.firstName} {item.lastName}</h3>
          <span className="family-status pending">Waiting for review</span>
        </div>
        <p>{item.gradYear} · {positionName(item.position)} · {item.teamName}</p>
        <div className="family-staff-actions">
          <button className="hsy-secondary" disabled={!!busyId} onClick={() => void decide(item.id, false)}>
            {busyId === item.id ? "Updating…" : "Decline"}
          </button>
          <button className="hsy-primary" disabled={!!busyId} onClick={() => void decide(item.id, true)}>
            {busyId === item.id ? "Updating…" : "Approve"}
          </button>
        </div>
      </article>)}
    </div>}
    {other.length > 0 && <details style={{ marginTop: 14 }}>
      <summary style={{ minHeight: 44, display: "flex", alignItems: "center", cursor: "pointer", color: "var(--family-muted)", fontSize: 13, fontWeight: 650 }}>
        Recently reviewed · {other.length}
      </summary>
      <div className="family-staff-list">
        {other.map(item => <article className="family-staff-card" key={item.id}>
          <div className="family-request-top">
            <h3>{item.firstName} {item.lastName}</h3>
            <span className={`family-status ${item.status === "approved" ? "approved" : "denied"}`}>{item.status === "approved" ? "Approved" : "Declined"}</span>
          </div>
          <p>{item.gradYear} · {positionName(item.position)} · {item.teamName}</p>
        </article>)}
      </div>
    </details>}
  </section>;
}

export default FamilyStaffReview;
