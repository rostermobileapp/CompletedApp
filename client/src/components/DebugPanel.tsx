import { useState, useEffect } from 'react';
import { X, Copy, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { DEBUG_MODE, getLogs, clearLogs, subscribeToLogs } from '@/lib/debugLogger';
import type { LogEntry } from '@/lib/debugLogger';

const TYPE_COLORS: Record<string, string> = {
  info: 'text-white',
  success: 'text-green-400',
  warning: 'text-yellow-400',
  error: 'text-red-400',
};

export default function DebugPanel() {
  const [logs, setLogs] = useState<LogEntry[]>(() => getLogs());
  const [minimized, setMinimized] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const unsub = subscribeToLogs(() => {
      setLogs([...getLogs()]);
    });
    return unsub;
  }, []);

  if (!DEBUG_MODE) return null;

  const handleCopy = async () => {
    const text = logs
      .map((l) => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.message}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
    }
  };

  const handleClear = () => {
    clearLogs();
    setLogs([]);
  };

  return (
    <div
      style={{ zIndex: 9999 }}
      className="fixed bottom-4 left-4 right-4 max-w-lg mx-auto bg-black/85 backdrop-blur-sm rounded-xl border border-gray-600 shadow-2xl"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <span className="text-xs font-bold text-gray-300 tracking-widest uppercase">StoreKit Debug</span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="text-gray-400 hover:text-white transition-colors"
            title="Copy logs"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          {copied && <span className="text-green-400 text-xs">Copied!</span>}
          <button
            onClick={handleClear}
            className="text-gray-400 hover:text-red-400 transition-colors"
            title="Clear logs"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setMinimized((m) => !m)}
            className="text-gray-400 hover:text-white transition-colors"
            title={minimized ? 'Expand' : 'Minimize'}
          >
            {minimized ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {!minimized && (
        <div className="max-h-48 overflow-y-auto px-3 py-2 space-y-1">
          {logs.length === 0 ? (
            <p className="text-xs text-gray-500 italic">No log entries yet. Try tapping "Subscribe via App Store".</p>
          ) : (
            logs.slice(0, 10).map((entry, i) => (
              <div key={i} className="flex gap-2 text-xs font-mono leading-snug">
                <span className="text-gray-500 shrink-0">{entry.timestamp}</span>
                <span className={TYPE_COLORS[entry.type] ?? 'text-white'}>{entry.message}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
