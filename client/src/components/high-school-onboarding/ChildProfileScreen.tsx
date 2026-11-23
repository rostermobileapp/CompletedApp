import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { HsyButton, HsyInput, ScreenFrame, type RequestFn } from "./shared";

type ChildData = {
  child: { firstName: string; lastName?: string };
  schedule?: Array<{ id: string; title?: string; startsAt?: string; location?: string }>;
  chats?: Array<{ id: string; name: string; kind?: "team" | "family" }>;
};
type ChildMessage = { id: string; sender: string; body: string; createdAt: string };

export function ChildProfileScreen({ data, request }: { data: ChildData; request: RequestFn }) {
  const [selectedChat, setSelectedChat] = useState<NonNullable<ChildData["chats"]>[number]>();
  const [messages, setMessages] = useState<ChildMessage[]>([]);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const chatUrl = selectedChat ? `/api/high-school/child-device/chats/${encodeURIComponent(selectedChat.id)}/messages` : undefined;
  const load = useCallback(async () => {
    if (!chatUrl) return;
    const result = await request("GET", chatUrl);
    setMessages(result.messages ?? []);
  }, [chatUrl, request]);
  useEffect(() => {
    let live = true;
    if (!chatUrl) return;
    setLoading(true); setMessages([]); setError("");
    request("GET", chatUrl).then(result => { if (live) setMessages(result.messages ?? []); })
      .catch(error => { if (live) setError(error.message); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
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
  return <ScreenFrame>
    <section className="hsy-content" style={{ paddingTop: 44 }}>
      <div className="hsy-success" style={{ display: "inline-flex", padding: 12, marginBottom: 18 }}><Check size={24}/></div>
      <h1 className="hsy-title-success">You're in, {data.child.firstName}</h1>
      <p className="hsy-subtitle">Your parent approved this session. It opens only your approved player profile.</p>
      <div className="hsy-card"><strong>Team schedule</strong>
        {data.schedule?.length ? data.schedule.map(event => <div className="hsy-list-row" key={event.id}>
          <span><strong>{event.title ?? "Team event"}</strong>
            <small style={{ display: "block", color: "#64748b" }}>
              {event.startsAt && <time dateTime={event.startsAt}>{new Date(event.startsAt).toLocaleString()}</time>}
              {event.location ? ` · ${event.location}` : ""}
            </small>
          </span>
        </div>) : <p className="hsy-note">No schedule items yet.</p>}
      </div>
      <div className="hsy-card" style={{ marginTop: 16 }}><strong>Approved chats</strong>
        {data.chats?.length ? data.chats.map(chat => <HsyButton className="hsy-secondary" key={chat.id} style={{ width: "100%", marginTop: 12 }} onClick={() => setSelectedChat(chat)}>
          {chat.name}
        </HsyButton>) : <p className="hsy-note">No chats are available.</p>}
      </div>
      {selectedChat && <section className="hsy-card" style={{ marginTop: 16 }} aria-label="Approved player chat">
        <div className="hsy-between"><strong>{selectedChat.name}</strong><HsyButton className="hsy-secondary" onClick={() => setSelectedChat(undefined)}>Close chat</HsyButton></div>
        {loading && <p role="status">Loading messages…</p>}
        {error && <p role="alert" className="hsy-error">{error}</p>}
        <div aria-live="polite">{messages.map(message => <div key={message.id} className="hsy-card tint" style={{ marginTop: 12 }}>
          <strong>{message.sender}</strong><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{message.body}</p>
        </div>)}</div>
        {!loading && !messages.length && !error && <p className="hsy-note">No messages yet.</p>}
        <form onSubmit={event => { event.preventDefault(); void send(); }} className="hsy-stack" style={{ marginTop: 14 }}>
          <label className="hsy-label">Message this approved chat
            <HsyInput value={body} maxLength={1000} onChange={event => setBody(event.target.value)}/>
          </label>
          <HsyButton type="submit" className="hsy-primary" disabled={!body.trim() || sending}>{sending ? "Sending…" : "Send message"}</HsyButton>
          <HsyButton className="hsy-secondary" disabled={sending} onClick={() => void load().catch(error => setError(error.message))}>Refresh messages</HsyButton>
        </form>
      </section>}
      <p className="hsy-footer-note">No parent controls, payments, coach messaging or unapproved groups are available from this player session.</p>
    </section>
  </ScreenFrame>;
}
