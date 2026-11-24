import { apiRequest } from "./queryClient";

export const FAMILY_API = "/api/high-school/family";
export type FamilyRequestFn = (method: string, path: string, body?: unknown, signal?: AbortSignal) => Promise<any>;
export const familyRequest: FamilyRequestFn = async (method, path, body, signal) =>
  (await apiRequest(method, path, body, signal)).json();
