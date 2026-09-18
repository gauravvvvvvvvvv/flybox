const isDev = import.meta.env.DEV;

export const API =
  import.meta.env.VITE_API_URL ??
  (isDev ? "http://localhost:8000" : "");

const defaultWs =
  typeof window === "undefined"
    ? "ws://localhost:8000/ws"
    : isDev
      ? "ws://localhost:8000/ws"
      : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;

export const WS = import.meta.env.VITE_WS_URL ?? defaultWs;

export async function post(path: string, body?: unknown) {
  const response = await fetch(API + path, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function del(path: string) {
  const response = await fetch(API + path, { method: "DELETE" });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}
