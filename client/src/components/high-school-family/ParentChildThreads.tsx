import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageCircle, Send } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { parentVerificationSession } from "@/lib/parentVerificationSession";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const base="/api/high-school/onboarding/child-chats";
type Thread={id:string;name:string;lastMessage?:string;lastMessageAt?:string};
type Message={id:string;body:string;sender:string;authorKind:"parent"|"child";createdAt:string};
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
    {threads.isError?<p role="alert" className="p-4 text-sm text-destructive">
      Child conversations could not be loaded. <button className="underline" onClick={()=>void threads.refetch()}>Retry child conversations</button>
    </p>:threads.data?.threads.map(thread=><button key={thread.id} type="button" className="flex items-center gap-3 w-full p-4 text-left hover:bg-muted/50"
      onClick={()=>setSelected(thread)} aria-label={`Message ${thread.name}`}>
      <span className="rounded-full bg-primary/10 p-3 text-primary"><MessageCircle size={22}/></span>
      <span className="min-w-0"><strong className="block truncate">{thread.name}</strong>
        <span className="block text-sm text-muted-foreground truncate">{thread.lastMessage||"Message your child"}</span></span>
    </button>)}
    {selected&&<ChildConversation key={`${actorId}:${revision}:${selected.id}`} actorId={actorId!}
      thread={selected} onClose={()=>setSelected(undefined)}/>}
  </section>;
}
function ChildConversation({actorId,thread,onClose}:{actorId:string;thread:Thread;onClose:()=>void}) {
  const client=useQueryClient();
  const [body,setBody]=useState(""),[error,setError]=useState(""),[sending,setSending]=useState(false);
  const attempt=useRef<{body:string;id:string}>();
  const path=`${base}/${encodeURIComponent(thread.id)}/messages`;
  const messages=useQuery<{messages:Message[]}>({
    queryKey:["parent-child-messages",actorId,thread.id],
    queryFn:async({signal})=>(await apiRequest("GET",path,undefined,signal)).json(),
    retry:false,staleTime:0,gcTime:0,refetchInterval:5_000,
  });
  const send=async()=>{
    if(!body.trim()||sending)return;
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
  return <Dialog open onOpenChange={open=>{if(!open)onClose();}}>
    <DialogContent className="max-w-lg max-h-[85dvh] flex flex-col">
      <DialogHeader><DialogTitle>{thread.name}</DialogTitle><DialogDescription>Private conversation with your child.</DialogDescription></DialogHeader>
      <div className="min-h-0 overflow-y-auto space-y-3 flex-1" aria-label={`Conversation with ${thread.name}`} aria-live="polite">
        {messages.isLoading&&<p role="status">Loading messages…</p>}
        {messages.isError?<p role="alert">Messages could not be loaded. <button className="underline" onClick={()=>void messages.refetch()}>Retry messages</button></p>:
          messages.data?.messages.map(message=><div key={message.id} className={`rounded-xl p-3 ${message.authorKind==="parent"?"bg-primary/10 ml-6":"bg-muted mr-6"}`}>
            <strong className="text-xs">{message.authorKind==="parent"?"You":thread.name}</strong>
            <p className="text-sm whitespace-pre-wrap break-words">{message.body}</p>
          </div>)}
        {messages.isSuccess&&!messages.data.messages.length&&<p className="text-sm text-muted-foreground">No messages yet. Say hello.</p>}
      </div>
      {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
      <form className="flex gap-2" onSubmit={event=>{event.preventDefault();void send();}}>
        <label className="flex-1 min-w-0"><span className="sr-only">Message {thread.name}</span>
          <input value={body} maxLength={1000} disabled={sending} onChange={event=>setBody(event.target.value)}
            className="w-full rounded-lg border bg-background px-3 py-3" placeholder="Type a message…"/></label>
        <button className="rounded-lg bg-primary text-primary-foreground px-4 disabled:opacity-50" type="submit"
          disabled={!body.trim()||sending||messages.isError} aria-label="Send message to child"><Send size={20}/></button>
      </form>
    </DialogContent>
  </Dialog>;
}
