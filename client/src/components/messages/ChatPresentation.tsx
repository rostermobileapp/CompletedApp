import { useEffect, useRef, type ReactNode, type KeyboardEvent, type Ref } from "react";
import { ArrowLeft, Send, Users } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";

export function chatMessagePresentation(mine: boolean, poll = false) {
  return {
    row: `flex gap-3 items-start ${mine ? "justify-end" : "justify-start"}`,
    column: `${poll ? "w-3/4 lg:max-w-[20%]" : "max-w-[70%]"} ${mine ? "order-1" : "order-2"}`,
    bubble: `rounded-lg ${poll ? `text-foreground ${mine ? "ml-auto" : ""}` : `p-3 elev-rest text-white ${mine ? "ml-auto" : ""}`}`,
    style: poll ? undefined : { backgroundColor: mine ? "#3c82f4" : "#212121" },
  };
}

/** Follow new messages, but do not pull someone away from older history. */
export function useChatScroll(threadId: string | undefined, lastMessageId: string | undefined, mine: boolean) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  useEffect(() => { follow.current = true; }, [threadId]);
  useEffect(() => {
    const element = scrollRef.current;
    if (element && lastMessageId && (follow.current || mine)) element.scrollTop = element.scrollHeight;
  }, [threadId, lastMessageId, mine]);
  return { scrollRef, onScroll: () => {
    const element = scrollRef.current;
    if (element) follow.current = element.scrollHeight - element.clientHeight - element.scrollTop < 96;
  } };
}

/** Presentation-only building blocks shared by the adult and child chat surfaces. */
export function ConversationHeader({
  title,
  subtitle,
  onBack,
  testId = "chat-header",
  avatar,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  testId?: string;
  avatar?: ReactNode;
}) {
  return <div className="sticky top-0 z-50 p-4 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pl-[12px] pr-[12px] pt-[4px] pb-[4px]" data-testid={testId}>
    <div className="flex items-center gap-3">
      <button onClick={onBack} className="p-2 hover:bg-accent rounded-lg transition-colors" data-testid="button-back" aria-label="Back to messages">
        <ArrowLeft className="w-5 h-5" />
      </button>
      {avatar ?? <div className="w-8 h-8 bg-muted rounded-full flex items-center justify-center">
        <Users className="w-4 h-4 text-muted-foreground" />
      </div>}
      <div className="flex-1 min-w-0">
        <h2 className="font-semibold truncate" data-testid="text-chat-title">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground" data-testid="text-chat-status">{subtitle}</p>}
      </div>
    </div>
  </div>;
}

export function ConversationListRow({
  title,
  lastMessage,
  onClick,
  testId,
  avatar,
  unreadCount,
  rightAction,
  titleTestId,
  lastMessageTestId,
  unreadTestId,
  emptyPreview = "Message your child",
}: {
  title: string;
  lastMessage?: string;
  onClick: () => void;
  testId?: string;
  avatar?: ReactNode;
  unreadCount?: number;
  rightAction?: ReactNode;
  titleTestId?: string;
  lastMessageTestId?: string;
  unreadTestId?: string;
  emptyPreview?: string;
}) {
  return <div role="button" tabIndex={0} onClick={onClick}
    onKeyDown={event => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onClick(); } }}
    aria-label={`Message ${title}`}
    className="rounded-lg hairline elev-rest p-4 cursor-pointer hover:bg-accent/50 transition-colors group dark:bg-[#212121] bg-[#e2e2e2] flex items-center gap-3 w-full text-left"
    data-testid={testId}>
    {avatar ?? <span className="w-10 h-10 bg-muted rounded-full flex items-center justify-center shrink-0">
      <span className="text-muted-foreground text-sm font-semibold">{initials(title)}</span>
    </span>}
    <span className="flex-1 min-w-0">
      <strong className="flex items-center gap-2 truncate font-semibold" data-testid={titleTestId}>{title}
        {!!unreadCount && <span data-testid={unreadTestId} className="bg-red-500 text-white text-xs rounded-full min-w-5 h-5 px-1 flex items-center justify-center font-bold">{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </strong>
      {(lastMessage || emptyPreview) && <span className="block text-sm text-muted-foreground truncate" data-testid={lastMessageTestId}>{lastMessage || emptyPreview}</span>}
    </span>
    {rightAction}
  </div>;
}

export function ChatMessageBubble({
  mine,
  sender,
  body,
  createdAt,
  testId,
}: {
  mine: boolean;
  sender: string;
  body: string;
  createdAt: string;
  testId?: string;
}) {
  const presentation = chatMessagePresentation(mine);
  return <div className={presentation.row} data-testid={testId}>
    {!mine && <span aria-hidden="true" className="order-1 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
      {initials(sender)}
    </span>}
    <div className={presentation.column}>
      <div className={presentation.bubble} style={presentation.style}>
        <div className={`flex items-center gap-2 mb-1 ${mine ? "justify-end" : ""}`}>
          {!mine && <span className="font-semibold text-xs">{sender}</span>}
          <time className="text-xs opacity-70" dateTime={createdAt}>{formatMessageTime(createdAt)}</time>
        </div>
        <p className="text-sm whitespace-pre-wrap break-words">{body}</p>
      </div>
    </div>
  </div>;
}

export function ChatComposer({
  value,
  onChange,
  onSend,
  disabled = false,
  placeholder = "Type a message...",
  ariaLabel = "Message",
  testId = "input-message",
  sendTestId = "button-send-message",
  sendAriaLabel = "Send message",
  inputDisabled,
  sendDisabled,
  sendClassName,
  sendContent,
  textareaRef,
  onBlur,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  testId?: string;
  sendTestId?: string;
  sendAriaLabel?: string;
  inputDisabled?: boolean;
  sendDisabled?: boolean;
  sendClassName?: string;
  sendContent?: ReactNode;
  textareaRef?: Ref<HTMLTextAreaElement>;
  onBlur?: () => void;
  children?: ReactNode;
}) {
  const submitOnEnter = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (!(sendDisabled ?? (disabled || !value.trim()))) onSend();
    }
  };
  return <div className="flex items-end gap-2">
    {children}
    <textarea ref={textareaRef} aria-label={ariaLabel} placeholder={placeholder} value={value} disabled={inputDisabled ?? disabled}
      onChange={event => onChange(event.target.value)} onKeyDown={submitOnEnter} onBlur={onBlur}
      className="flex-1 min-w-0 resize-none overflow-y-auto min-h-[40px] max-h-[120px] py-2 px-3 rounded-md hairline elev-inset bg-background text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      rows={1} data-testid={testId} />
    <Button type="button" onClick={onSend} disabled={sendDisabled ?? (disabled || !value.trim())}
      className={sendClassName ?? "mb-1"}
      data-testid={sendTestId} aria-label={sendAriaLabel}>
      {sendContent ?? <Send className="w-4 h-4" />}
    </Button>
  </div>;
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? "").join("") || "?";
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return format(date, "h:mm a");
}
