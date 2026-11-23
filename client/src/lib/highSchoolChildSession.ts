/** Child-only transport. Never reads or forwards a parent/provider session. */
export async function requestChildSession(token: string, method: string, url: string, body?: unknown) {
  if (!/^hs_child_[A-Za-z0-9_-]{43}$/.test(token) ||
      !/^\/api\/high-school\/child-device\/(?:session|chats\/[0-9a-f-]+\/messages)$/i.test(url)) {
    throw new Error("This action is outside the approved player session.");
  }
  const response = await fetch(url, {
    method,
    credentials: "omit",
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const error = new Error(response.status === 401 || response.status === 403
      ? "Player access ended or this chat is not approved. Ask your parent for help."
      : "The player request could not be completed. Try again.");
    throw error;
  }
  return response.json();
}
