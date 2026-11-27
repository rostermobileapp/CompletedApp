import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { apiRequest } from "@/lib/queryClient";
import { parentVerificationSession } from "@/lib/parentVerificationSession";
import { useChatViewport } from "@/components/messages/useChatViewport";
import { ChatComposer, ChatMessageBubble, ConversationHeader, ConversationListRow, useChatScroll } from "@/components/messages/ChatPresentation";

const base="/api/high-school/onboarding/child-chats";
type Thread={id:string;name:string;lastMessage?:string;lastMessageAt?:string};
type Message={id:string;body:string;sender:string;authorKind?:"parent"|"child";createdAt:string};
/** Intentionally independent of dashboard team/league selection. */
export function ParentChildThreads({actorId,onHasThreadsChange}:{actorId?:string;onHasThreadsChange?:(hasThreads:boolean)=>void}) {
  const revision=useSyncExternalStore(parentVerificationSession.subscribe,parentVerificationSession.snapshot);
  const status=useQuery<{enrolled:boolean;verified:boolean}>({
    queryKey:["live-parent-status",actorId,revision],
    queryFn:async({signal})=>(await apiRequest("GET","/api/high-school/parent-verification/status",undefined,signal)).json(),
    enabled:!!actorId,staleTime:15_000,retry:false,
  });
  const enabled=!!actorId&&status.data?.enrolled===true&&status.data.verified;
  const threads=useQuery<{threads:Thread[]}>({
    queryKey:["parent-child-threads",actorId,revision],
    queryFn:async({signal})=>(await apiRequest("GET",base,undefined,signal)).json(),
    enabled,staleTime:0,retry:false,refetchInterval:10_000,
  });
  const [selected,setSelected]=useState<Thread>();
  useEffect(()=>{setSelected(undefined);},[actorId,revision]);
  const hasThreads=enabled&&threads.isSuccess&&(threads.data?.threads.length??0)>0;
  useEffect(()=>{onHasThreadsChange?.(hasThreads);},[hasThreads,onHasThreadsChange]);
  if(!enabled)return null;
  return <section aria-label="Messages with your children" className="border-b border-border" data-testid="parent-child-threads">
    {threads.isLoading?<div className="space-y-3 py-3" data-testid="child-conversations-loading">{[1,2].map(item=>
      <div key={item} className="h-[72px] animate-pulse rounded-lg bg-muted/70" />)}</div>
      :threads.isError?<p role="alert" className="p-4 text-sm text-destructive">
      Child conversations could not be loaded. <button className="underline" onClick={()=>void threads.refetch()}>Retry child conversations</button>
    </p>:<div className="space-y-3">{threads.data?.threads.map(thread=><ConversationListRow key={thread.id} title={thread.name} lastMessage={thread.lastMessage}
      onClick={()=>setSelected(thread)} testId={`parent-child-thread-${thread.id}`} />)}</div>}
    {selected&&<ChildConversation key={`${actorId}:${revision}:${selected.id}`} actorId={actorId!}
      thread={selected} onClose={()=>setSelected(undefined)}/>}
  </section>;
}
function ChildConversation({actorId,thread,onClose}:{actorId:string;thread:Thread;onClose:()=>void}) {
  const {bottomOffset}=useChatViewport();
  const client=useQueryClient();
  const [body,setBody]=useState(""),[error,setError]=useState(""),[sending,setSending]=useState(false);
  const attempt=useRef<{body:string;id:string}>();
  const path=`${base}/${encodeURIComponent(thread.id)}/messages`;
  const messages=useQuery<{messages:Message[]}>({
    queryKey:["parent-child-messages",actorId,thread.id],
    queryFn:async({signal})=>(await apiRequest("GET",path,undefined,signal)).json(),
    retry:false,staleTime:0,gcTime:0,refetchInterval:5_000,
  });
  const lastMessage=messages.data?.messages.at(-1);
  const scroll=useChatScroll(thread.id,lastMessage?.id,lastMessage?.authorKind==="parent"||lastMessage?.sender==="You");
  const send=async()=>{
    if(!body.trim()||sending||messages.isError)return;
    setSending(true);setError("");
    const text=body.trim();
    if(attempt.current?.body!==text)attempt.current={body:text,id:crypto.randomUUID()};
    try{
      await apiRequest("POST",path,{body:text,requestId:attempt.current.id});
      setBody("");attempt.current=undefined;
      await Promise.all([messages.refetch(),client.invalidateQueries({queryKey:["parent-child-threads",actorId]})]);
    }catch{setError("Your message could not be sent. Check your connection and parent verification, then retry.");}
    finally{setSending(false);}
  };
  return createPortal(<section aria-label={`Conversation with ${thread.name}`} className="fixed inset-0 z-[70] flex min-h-0 flex-col overflow-hidden bg-background text-foreground"
    style={{bottom:bottomOffset,paddingTop:"var(--native-inset-top, env(safe-area-inset-top, 0px))"}}>
    <ConversationHeader title={thread.name} subtitle="Private conversation" onBack={onClose} />
    <div className="relative min-h-0 flex-1" data-testid="messages-container">
      <div ref={scroll.scrollRef} onScroll={scroll.onScroll} className="absolute inset-0 overflow-y-auto" aria-live="polite" style={{overflowAnchor:"none"}}>
        <div className="space-y-4 p-4 pb-6">
          {messages.isLoading&&<div className="space-y-4" data-testid="messages-loading">{[1,2,3].map(i=><div key={i} className="h-12 w-2/3 animate-pulse rounded-lg bg-muted"/>)}</div>}
          {messages.isError?<p role="alert" className="text-sm text-destructive">
            Messages could not be loaded. <button className="underline" onClick={()=>void messages.refetch()}>Retry messages</button>
          </p>:messages.data?.messages.map(message=><ChatMessageBubble key={message.id}
            mine={message.authorKind==="parent"||message.sender.trim().toLowerCase()==="you"}
            sender={message.authorKind==="parent"||message.sender.trim().toLowerCase()==="you"?"You":thread.name}
            body={message.body} createdAt={message.createdAt} testId={`message-${message.id}`} />)}
          {messages.isSuccess&&!messages.data.messages.length&&<p className="text-sm text-muted-foreground">No messages yet. Say hello.</p>}
        </div>
      </div>
    </div>
    {error&&<p role="alert" className="px-4 pt-2 text-sm text-destructive">{error}</p>}
    <form onSubmit={event=>{event.preventDefault();void send();}}
      className="border-t border-border bg-background px-4 pt-2 pb-[calc(8px+var(--native-inset-bottom,env(safe-area-inset-bottom,0px)))]">
      <ChatComposer value={body} onChange={value=>setBody(value.slice(0,1000))} onSend={()=>void send()}
        disabled={sending||messages.isError} placeholder="Type a message..." ariaLabel={`Message ${thread.name}`}
        sendTestId="button-send-message" sendAriaLabel="Send message to child" />
    </form>
  </section>,document.body);
}
