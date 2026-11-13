import { apiRequest } from "@/lib/queryClient";

export type ScorekeeperOfflineOperation = {
  id: string;
  method: string;
  path: string;
  body?: Record<string, unknown>;
};

const queueKey = (userId: string) => `roster.scorekeeper.offline.v1.${userId}`;

function readQueue(userId: string): ScorekeeperOfflineOperation[] {
  try {
    const value = localStorage.getItem(queueKey(userId));
    const parsed = value ? JSON.parse(value) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(userId: string, operations: ScorekeeperOfflineOperation[]) {
  if (operations.length) localStorage.setItem(queueKey(userId), JSON.stringify(operations));
  else localStorage.removeItem(queueKey(userId));
}

function storeOperation(userId: string, operation: ScorekeeperOfflineOperation) {
  const operations = readQueue(userId).filter((item) => item.id !== operation.id);
  operations.push(operation);
  writeQueue(userId, operations);
}

function removeOperation(userId: string, operationId: string) {
  writeQueue(userId, readQueue(userId).filter((item) => item.id !== operationId));
}

function isRetryableFailure(error: unknown) {
  const status = (error as { status?: number } | null)?.status;
  return (typeof navigator !== "undefined" && !navigator.onLine)
    || error instanceof TypeError
    || (typeof status === "number" && status >= 500);
}

export function getPendingScorekeeperOperationCount(userId: string) {
  return typeof localStorage === "undefined" ? 0 : readQueue(userId).length;
}

export async function requestWithOfflineBackup(
  userId: string,
  method: string,
  path: string,
  body?: Record<string, unknown>,
  operationId?: string,
): Promise<Response | { queuedOffline: true }> {
  const operation: ScorekeeperOfflineOperation = {
    id: operationId || `${method}:${path}:${body?.id || crypto.randomUUID()}`,
    method,
    path,
    ...(body ? { body } : {}),
  };
  storeOperation(userId, operation);
  try {
    const response = await apiRequest(method, path, body);
    removeOperation(userId, operation.id);
    return response;
  } catch (error) {
    if (method === "DELETE" && (error as { status?: number } | null)?.status === 404) {
      removeOperation(userId, operation.id);
      return new Response(null, { status: 204 });
    }
    if (isRetryableFailure(error)) return { queuedOffline: true };
    removeOperation(userId, operation.id);
    throw error;
  }
}

export async function flushScorekeeperOfflineQueue(userId: string) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return 0;
  const operations = readQueue(userId);
  let sent = 0;
  for (const operation of operations) {
    try {
      await apiRequest(operation.method, operation.path, operation.body);
      removeOperation(userId, operation.id);
      sent++;
    } catch (error) {
      if ((operation.method === "DELETE" && (error as { status?: number } | null)?.status === 404)) {
        removeOperation(userId, operation.id);
        sent++;
        continue;
      }
      // Preserve the first failed write and later writes in order. A server
      // rejection is not silently discarded; a later manual retry can surface it.
      break;
    }
  }
  return sent;
}
