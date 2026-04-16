export const DEBUG_MODE = true;

export type LogType = 'success' | 'error' | 'warning' | 'info';

export interface LogEntry {
  id: number;
  timestamp: string;
  message: string;
  type: LogType;
}

const MAX_ENTRIES = 50;
const STORAGE_KEY = 'roster_debug_logs';

let logStore: LogEntry[] = [];
let idCounter = 0;
type Listener = () => void;
const listeners: Listener[] = [];

function persist(entries: LogEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
  }
}

function notify() {
  listeners.forEach((fn) => fn());
}

export function debugLog(message: string, type: LogType = 'info') {
  if (!DEBUG_MODE) return;

  const now = new Date();
  const timestamp = now.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }) + '.' + String(now.getMilliseconds()).padStart(3, '0');

  const entry: LogEntry = { id: ++idCounter, timestamp, message, type };
  logStore = [...logStore, entry].slice(-MAX_ENTRIES);
  persist(logStore);
  notify();

  const prefix = type === 'error' ? '🔴' : type === 'success' ? '🟢' : type === 'warning' ? '🟡' : '⚪';
  console.log(`[IAP DEBUG] ${prefix} ${timestamp} ${message}`);
}

export function getLogStore(): LogEntry[] {
  return logStore;
}

export function subscribeToLogs(fn: Listener): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}

export function getAllLogsText(): string {
  return logStore
    .map((e) => `[${e.timestamp}] [${e.type.toUpperCase()}] ${e.message}`)
    .join('\n');
}
