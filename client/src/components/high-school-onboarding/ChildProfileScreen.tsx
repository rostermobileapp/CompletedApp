import { useCallback, useEffect, useState } from "react";
import type { MainScreenId } from "@/lib/mainNavRoutes";
import { ScopedAccountFrame, ScopedHomeFeed, ScopedHomeNotice, ScopedPageHeading, type ScopedHomeEvent } from "@/components/dashboard/ScopedAccountHome";
import type { RequestFn } from "./shared";

type ChildData = {
  child: { firstName: string; lastName?: string;birthYear?:number;gradYear?:number };
  teamStatus?: "awaiting_team" | "coverage_pending" | "connected";
  teams?: Array<{id:string;name:string}>;
  schedule?: ScopedHomeEvent[];
  chats?: Array<{ id: string; name: string; kind?: "team" | "family" }>;
};
type ChildMessage = { id: string; sender: string; body: string; createdAt: string };

export function ChildProfileScreen({ data, request, autoRefresh=true, onSignOut }: {
  data: ChildData; request: RequestFn; autoRefresh?:boolean; onSignOut?: () => void;
}) {
  const [current,setCurrent]=useState(data);
  const [refreshError,setRefreshError]=useState("");
  useEffect(()=>setCurrent(data),[data]);
  const [selectedChat, setSelectedChat] = useState<NonNullable<ChildData["chats"]>[number]>();
  const [messages, setMessages] = useState<ChildMessage[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [page, setPage] = useState<MainScreenId | "schedule">("home");
  const [teamId, setTeamId] = useState<string>();
  const [notice, setNotice] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    if (selectedChat && !current.chats?.some(chat => chat.id === selectedChat.id)) {
      setSelectedChat(undefined); setMessages([]); setBody("");
    }
  }, [current, selectedChat]);
  useEffect(()=>{
    if(!autoRefresh)return;
    let live=true,pending=false;
    const refresh=async()=>{
      if(pending||document.visibilityState==="hidden")return;
      pending=true;
      try{
        const next=await request("GET","/api/high-school/child-device/session");
        if(live){
          setCurrent(next);setRefreshError("");
          setSelectedChat(previous=>{
            if(previous&&!next.chats?.some((chat:any)=>chat.id===previous.id)){
              setMessages([]);setBody("");return undefined;
            }
            return previous;
          });
        }
      }catch{
        if(live){
          setCurrent(previous=>({...previous,schedule:[],chats:[],teams:[]}));
          setSelectedChat(undefined);setMessages([]);setBody("");
          setRefreshError("Access could not be refreshed. Check your connection or ask your parent to verify this phone.");
        }
      }finally{pending=false;}
    };
    const timer=window.setInterval(()=>void refresh(),15_000);
    const onFocus=()=>void refresh();
    window.addEventListener("focus",onFocus);document.addEventListener("visibilitychange",onFocus);
    return()=>{live=false;window.clearInterval(timer);window.removeEventListener("focus",onFocus);document.removeEventListener("visibilitychange",onFocus);};
  },[request,autoRefresh]);
  const chatUrl = selectedChat ? `/api/high-school/child-device/chats/${encodeURIComponent(selectedChat.id)}/messages` : undefined;
  const load = useCallback(async () => {
    if (!chatUrl) return;
    const result = await request("GET", chatUrl);
    setMessages(result.messages ?? []);
  }, [chatUrl, request]);
  useEffect(() => {
    let live = true, pending = false;
    if (!chatUrl) return;
    setLoading(true); setMessages([]); setError("");
    const refreshMessages=()=>{
      if(pending||document.visibilityState==="hidden")return;
      pending=true;
      void request("GET",chatUrl).then(result=>{
        if(live){setMessages(result.messages??[]);setError("");}
      }).catch(error=>{
        if(live){setMessages([]);setError(error.message);}
      }).finally(()=>{pending=false;if(live)setLoading(false);});
    };
    refreshMessages();
    const timer=window.setInterval(refreshMessages,5_000);
    window.addEventListener("focus",refreshMessages);
    document.addEventListener("visibilitychange",refreshMessages);
    return () => { live = false;window.clearInterval(timer);
      window.removeEventListener("focus",refreshMessages);document.removeEventListener("visibilitychange",refreshMessages); };
  }, [chatUrl, request]);
  const send = async () => {
    if (!chatUrl || !body.trim() || sending) return;
    setSending(true); setError("");
    try {
      await request("POST", chatUrl, { body: body.trim() });
      setBody(""); await load();
    } catch (error) { setError((error as Error).message); }
    finally { setSending(false); }
  };
  const teams = current.teams ?? [];
  const activeTeam = teams.find(team => team.id === teamId) ?? teams[0];
  const events = (current.schedule ?? []).filter(event => !event.teamId || event.teamId === activeTeam?.id);
  const navigate = (next: MainScreenId) => {
    if (next === "payments") { setNotice("Payments are not available from this player session."); return; }
    setSelectedChat(undefined); setPage(next);
  };
  const refresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try { setCurrent(await request("GET", "/api/high-school/child-device/session")); setRefreshError(""); }
    catch {
      setCurrent(previous => ({...previous,teams:[],schedule:[],chats:[]}));
      setSelectedChat(undefined); setMessages([]); setBody("");
      setRefreshError("Access could not be refreshed. Check your connection or ask your parent to verify this phone.");
    } finally { setRefreshing(false); }
  };
  const teamStatus = current.teamStatus === "awaiting_team" ? <div role="status">
    <strong className="text-sm">Ready for your team</strong>
    <p className="text-sm text-muted-foreground mt-1">Ask your parent to accept your team invitation. Your approved team will appear automatically.</p>
  </div> : current.teamStatus === "coverage_pending" ? <div role="status">
    <strong className="text-sm">Your team is connected</strong>
    <p className="text-sm text-muted-foreground mt-1">Your parent needs to check Player Pro or league coverage before team information is available.</p>
  </div> : undefined;
  const actionClass = "rounded-lg border px-4 py-3 text-sm font-medium hover:bg-muted/50 disabled:opacity-50";
  return <ScopedAccountFrame name={current.child.firstName} teams={teams.map(team => ({...team,role:"Player"}))} selectedTeamId={activeTeam?.id}
    onTeamChange={setTeamId} activeId={page === "schedule" ? "home" : page}
    onNavigate={navigate} onRefresh={() => void refresh()} refreshing={refreshing} onSignOut={onSignOut}>
    {refreshError && <p role="alert" className="px-6 py-3 text-sm text-destructive">{refreshError}</p>}
    {(page === "home" || page === "schedule") && <ScopedHomeFeed events={events} teamName={activeTeam?.name}
      onUnavailable={feature => setNotice(`${feature} is not available in this player session yet.`)}
      onAlerts={() => setNotice("There are no player alerts to show.")} onAll={() => setPage("schedule")}
      onAdd={() => setNotice("Only authorized team staff can add schedule items.")}
      fullSchedule={page === "schedule"} status={teamStatus} />}
    {page === "teams" && <ScopedPageHeading title="My Team">
      {teams.length ? <div className="space-y-3">{teams.map(team =>
        <button key={team.id} className={`${actionClass} block w-full text-left`} onClick={() => {setTeamId(team.id);setPage("home");}}>{team.name}</button>
      )}</div> : teamStatus ?? <p className="text-sm text-muted-foreground">No approved team is available.</p>}
    </ScopedPageHeading>}
    {page === "profile" && <ScopedPageHeading title="Profile">
      <div className="rounded-xl hairline elev-rest p-4 bg-[#e2e2e2] dark:bg-[#212121] space-y-2">
        <h2 className="font-semibold">{current.child.firstName} {current.child.lastName}</h2>
        {current.child.birthYear && <p className="text-sm text-muted-foreground">Birth year: {current.child.birthYear}</p>}
        {current.child.gradYear && <p className="text-sm text-muted-foreground">Graduation year: {current.child.gradYear}</p>}
        <p className="text-sm text-muted-foreground">Your parent manages your player details.</p>
      </div>
    </ScopedPageHeading>}
    {page === "messages" && <ScopedPageHeading title="Messages">
      {!selectedChat ? <div className="space-y-3">{current.chats?.length ? current.chats.map(chat =>
        <button className={`${actionClass} block w-full text-left`} key={chat.id} onClick={() => setSelectedChat(chat)}>{chat.name}</button>
      ) : <p className="text-sm text-muted-foreground">No chats are available.</p>}</div> :
        <section aria-label="Approved player chat" className="space-y-3">
          <div className="flex items-center justify-between gap-2"><h2 className="font-semibold">{selectedChat.name}</h2>
            <button className={actionClass} onClick={() => setSelectedChat(undefined)}>Close chat</button></div>
          {loading && <p role="status">Loading messages…</p>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div aria-live="polite" className="space-y-3">{messages.map(message =>
            <div key={message.id} className="rounded-xl border p-3">
              <strong className="text-sm">{message.sender}</strong><p className="text-sm whitespace-pre-wrap break-words">{message.body}</p>
            </div>)}</div>
          {!loading && !messages.length && !error && <p className="text-sm text-muted-foreground">No messages yet.</p>}
          <form onSubmit={event => {event.preventDefault();void send();}} className="space-y-3">
            <label className="block text-sm">Message this approved chat
              <input className="w-full rounded-lg border bg-background px-3 py-3 mt-2" value={body} maxLength={1000} onChange={event => setBody(event.target.value)}/>
            </label>
            <button type="submit" className={`${actionClass} bg-primary text-primary-foreground`} disabled={!body.trim() || sending}>{sending ? "Sending…" : "Send message"}</button>
            <button type="button" className={`${actionClass} ml-2`} disabled={sending} onClick={() => void load().catch(error => setError(error.message))}>Refresh messages</button>
          </form>
        </section>}
    </ScopedPageHeading>}
    {notice && <ScopedHomeNotice title="Player access" onClose={() => setNotice("")}>{notice}</ScopedHomeNotice>}
  </ScopedAccountFrame>;
}
