export const DEBUG_MODE = true;

export type LogType = 'info' | 'success' | 'warning' | 'error';

export interface LogEntry {
  timestamp: string;
  message: string;
  type: LogType;
}

const MAX_ENTRIES = 50;
const STORAGE_KEY = 'roster_debug_logs';

let logStore: LogEntry[] = [];

function loadFromStorage(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      logStore = JSON.parse(raw);
    }
  } catch {
    logStore = [];
  }
}

loadFromStorage();

let listeners: Array<() => void> = [];

export function subscribeToLogs(fn: () => void): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

function notify() {
  listeners.forEach((fn) => fn());
}

export function debugLog(message: string, type: LogType = 'info'): void {
  if (!DEBUG_MODE) return;

  const entry: LogEntry = {
    timestamp: new Date().toLocaleTimeString(),
    message,
    type,
  };

  logStore = [entry, ...logStore].slice(0, MAX_ENTRIES);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logStore));
  } catch {
  }

  notify();
}

export function getLogs(): LogEntry[] {
  return logStore;
}

export function clearLogs(): void {
  logStore = [];
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
  }
  notify();
}
