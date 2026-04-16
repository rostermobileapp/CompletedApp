import { useState, useEffect, useRef } from 'react';
import { X, Copy, ChevronDown, ChevronUp } from 'lucide-react';
import {
  DEBUG_MODE,
  getLogStore,
  subscribeToLogs,
  getAllLogsText,
  type LogEntry,
} from '@/lib/debugLogger';

const TYPE_COLORS: Record<string, string> = {
  success: 'text-green-400',
  error: 'text-red-400',
  warning: 'text-yellow-400',
  info: 'text-white',
};

export default function DebugPanel() {
  const [entries, setEntries] = useState<LogEntry[]>(() => getLogStore());
  const [minimized, setMinimized] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = subscribeToLogs(() => {
      const latest = getLogStore();
      setEntries([...latest]);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!minimized && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, minimized]);

  if (!DEBUG_MODE || dismissed) return null;

  const visible = entries.slice(-10);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getAllLogsText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = getAllLogsText();
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      style={{ zIndex: 9999 }}
      className="fixed bottom-4 left-4 right-4 max-w-lg mx-auto rounded-xl overflow-hidden shadow-2xl border border-white/20 bg-black/80 backdrop-blur-sm font-mono text-xs"
    >
      <div className="flex items-center justify-between px-3 py-2 bg-white/10">
        <span className="text-white font-semibold tracking-wide">
          IAP Debug {entries.length > 0 ? `(${entries.length})` : ''}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="text-white/70 hover:text-white transition-colors flex items-center gap-1"
            title="Copy all logs"
          >
            <Copy size={13} />
            <span>{copied ? 'Copied!' : 'Copy Logs'}</span>
          </button>
          <button
            onClick={() => setMinimized((m) => !m)}
            className="text-white/70 hover:text-white transition-colors"
            title={minimized ? 'Expand' : 'Minimize'}
          >
            {minimized ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="text-white/70 hover:text-white transition-colors"
            title="Hide panel"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {!minimized && (
        <div
          ref={scrollRef}
          className="overflow-y-auto max-h-48 px-3 py-2 space-y-1"
        >
          {visible.length === 0 ? (
            <p className="text-white/40 italic">No log entries yet.</p>
          ) : (
            visible.map((entry) => (
              <div key={entry.id} className="flex gap-2 leading-snug">
                <span className="text-white/40 shrink-0">{entry.timestamp}</span>
                <span className={`${TYPE_COLORS[entry.type] ?? 'text-white'} break-all`}>
                  {entry.message}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
