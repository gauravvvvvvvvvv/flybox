const isDev = import.meta.env.DEV;

export const API =
  import.meta.env.VITE_API_URL ??
  (isDev ? "http://localhost:8000" : "");

// A new id is created for every page instance. It is deliberately not stored in
// localStorage/sessionStorage/cookies: refreshing or reopening FLYBOX creates a
// completely new sandbox.
export const SESSION_ID =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `flybox-${Date.now()}-${Math.random().toString(36).slice(2)}`;

function sessionHeaders(extra?: HeadersInit): HeadersInit {
  return {
    "X-Flybox-Session": SESSION_ID,
    ...(extra ?? {}),
  };
}

export function apiUrl(path: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${API}${path}${separator}sid=${encodeURIComponent(SESSION_ID)}`;
}

const wsBase =
  typeof window === "undefined"
    ? "ws://localhost:8000/ws"
    : isDev
      ? "ws://localhost:8000/ws"
      : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;

export const WS =
  import.meta.env.VITE_WS_URL
    ? `${import.meta.env.VITE_WS_URL}${import.meta.env.VITE_WS_URL.includes("?") ? "&" : "?"}sid=${encodeURIComponent(SESSION_ID)}`
    : `${wsBase}?sid=${encodeURIComponent(SESSION_ID)}`;

export async function get(path: string) {
  const response = await fetch(API + path, {
    headers: sessionHeaders(),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function post(path: string, body?: unknown) {
  const response = await fetch(API + path, {
    method: "POST",
    headers: sessionHeaders(body ? { "Content-Type": "application/json" } : undefined),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function del(path: string) {
  const response = await fetch(API + path, {
    method: "DELETE",
    headers: sessionHeaders(),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export function closeSession() {
  // Best effort only. The backend also destroys disconnected sessions after a
  // short grace window, so correctness never depends on unload delivery.
  void fetch(API + "/api/session/close", {
    method: "POST",
    headers: sessionHeaders(),
    keepalive: true,
  }).catch(() => {});
}
