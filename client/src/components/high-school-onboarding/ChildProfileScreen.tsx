import { useCallback, useEffect, useState } from "react";
import type { MainScreenId } from "@/lib/mainNavRoutes";
import { ScopedAccountFrame, ScopedHomeFeed, ScopedHomeNotice, ScopedPageHeading, type ScopedHomeEvent } from "@/components/dashboard/ScopedAccountHome";
import { ChatComposer, ChatMessageBubble, ConversationHeader, ConversationListRow, useChatScroll } from "@/components/messages/ChatPresentation";
import type { RequestFn } from "./shared";

type ChildData = {
  child: { firstName: string; lastName?: string;birthYear?:number;gradYear?:number };
  teamStatus?: "awaiting_team" | "coverage_pending" | "connected";
  teams?: Array<{id:string;name:string}>;
  schedule?: ScopedHomeEvent[];
  chats?: Array<{ id: string; name: string; kind?: "team" | "family" }>;
};
type ChildMessage = { id: string; sender: string; body: string; createdAt: string; authorKind?: "parent" | "child" };

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
  const lastMessage=messages.at(-1);
  const scroll=useChatScroll(selectedChat?.id,lastMessage?.id,lastMessage?.sender==="You");
  const load = useCallback(async () => {
    if (!chatUrl) return;
    const result = await request("GET", chatUrl);
    setMessages(result.messages ?? []);
    setError("");
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
    if (!chatUrl || !body.trim() || sending || error) return;
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
  return <ScopedAccountFrame name={current.child.firstName} teams={teams.map(team => ({...team,role:"Player"}))} selectedTeamId={activeTeam?.id}
    onTeamChange={setTeamId} activeId={page === "schedule" ? "home" : page}
    onNavigate={navigate} onRefresh={() => void refresh()} refreshing={refreshing} onSignOut={onSignOut}
    fullScreen={page === "messages" && !!selectedChat}>
    {refreshError && <p role="alert" className="px-6 py-3 text-sm text-destructive">{refreshError}</p>}
    {(page === "home" || page === "schedule") && <ScopedHomeFeed events={events} teamName={activeTeam?.name}
      onUnavailable={feature => setNotice(`${feature} is not available in this player session yet.`)}
      onAlerts={() => setNotice("There are no player alerts to show.")} onAll={() => setPage("schedule")}
      onAdd={() => setNotice("Only authorized team staff can add schedule items.")}
      fullSchedule={page === "schedule"} status={teamStatus} />}
    {page === "teams" && <ScopedPageHeading title="My Team">
      {teams.length ? <div className="space-y-3">{teams.map(team =>
        <button key={team.id} className="rounded-lg hairline elev-rest p-4 cursor-pointer hover:bg-accent/50 transition-colors group dark:bg-[#212121] bg-[#e2e2e2] block w-full text-left font-semibold" onClick={() => {setTeamId(team.id);setPage("home");}}>{team.name}</button>
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
    {page === "messages" && (!selectedChat ? <ScopedPageHeading title="Messages">
      {current.chats?.length ? <div className="space-y-3">{current.chats.map(chat =>
        <ConversationListRow key={chat.id} title={chat.name} emptyPreview=""
          onClick={() => setSelectedChat(chat)} testId="approved-player-chat" />)}
      </div> : <p className="text-sm text-muted-foreground">No chats are available.</p>}
    </ScopedPageHeading> : <section aria-label="Approved player chat" className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <ConversationHeader title={selectedChat.name} subtitle={selectedChat.kind==="family"?"Private conversation":"Team members"} onBack={() => setSelectedChat(undefined)} />
      <div className="relative min-h-0 flex-1" data-testid="messages-container">
        <div ref={scroll.scrollRef} onScroll={scroll.onScroll} aria-live="polite" className="absolute inset-0 overflow-y-auto" style={{overflowAnchor:"none"}}>
          <div className="space-y-4 p-4 pb-6">
            {loading && <div className="space-y-4" data-testid="messages-loading">{[1,2,3].map(i=><div key={i} className="h-12 w-2/3 animate-pulse rounded-lg bg-muted"/>)}</div>}
            {error && <p role="alert" className="text-sm text-destructive">{error}{" "}
              <button type="button" className="underline" onClick={() => void load().catch(nextError => setError((nextError as Error).message))}>Retry messages</button></p>}
            {!error && messages.map(message => <ChatMessageBubble key={message.id}
              mine={message.authorKind === "child" || message.sender.trim().toLowerCase() === "you"}
              sender={message.authorKind === "child" || message.sender.trim().toLowerCase() === "you" ? "You" : message.sender}
              body={message.body} createdAt={message.createdAt} testId={`message-${message.id}`} />)}
            {!loading && !messages.length && !error && <p className="text-sm text-muted-foreground">No messages yet.</p>}
          </div>
        </div>
      </div>
      <form onSubmit={event => {event.preventDefault();void send();}}
        className="border-t border-border bg-background px-4 pt-2 pb-[calc(8px+var(--native-inset-bottom,env(safe-area-inset-bottom,0px)))]">
        <ChatComposer value={body} onChange={value => setBody(value.slice(0,1000))} onSend={() => void send()}
          disabled={sending || !!error} ariaLabel="Message this approved chat" placeholder="Type a message..."
          sendTestId="button-send-message" sendAriaLabel="Send message" />
      </form>
    </section>)}
    {notice && <ScopedHomeNotice title="Player access" onClose={() => setNotice("")}>{notice}</ScopedHomeNotice>}
  </ScopedAccountFrame>;
}
