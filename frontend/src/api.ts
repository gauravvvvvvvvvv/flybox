const isDev = import.meta.env.DEV;

export const API =
  import.meta.env.VITE_API_URL ??
  (isDev ? "http://localhost:8000" : "");

export const SESSION_ID =
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `flybox-${Date.now()}-${Math.random().toString(36).slice(2)}`;

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

type FrameListener = (frame: any) => void;
type ErrorListener = (message: string) => void;

let socket: WebSocket | null = null;
let opening: Promise<WebSocket> | null = null;
let allowReconnect = true;
let reconnectTimer: number | null = null;
let rpcCounter = 0;
const frameListeners = new Set<FrameListener>();
const errorListeners = new Set<ErrorListener>();
const pending = new Map<
  string,
  { resolve: (value: any) => void; reject: (reason?: unknown) => void }
>();

function emitError(message: string) {
  for (const listener of errorListeners) listener(message);
}

function rejectPending(message: string) {
  for (const request of pending.values()) request.reject(new Error(message));
  pending.clear();
}

function openSocket(): Promise<WebSocket> {
  if (socket?.readyState === WebSocket.OPEN) return Promise.resolve(socket);
  if (opening) return opening;

  allowReconnect = true;
  opening = new Promise<WebSocket>((resolve, reject) => {
    const next = new WebSocket(WS);
    socket = next;

    next.onopen = () => {
      opening = null;
      resolve(next);
    };

    next.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === "frame") {
        for (const listener of frameListeners) listener(message);
        return;
      }
      if (message.type === "rpc_result") {
        const request = pending.get(String(message.id));
        if (!request) return;
        pending.delete(String(message.id));
        if (message.ok) request.resolve(message.data);
        else request.reject(new Error(message.error ?? "FLYBOX command failed"));
        return;
      }
      if (message.type === "error") {
        emitError(message.message + (message.error ? ` — ${message.error}` : ""));
      }
    };

    next.onerror = () => {
      emitError("Could not connect to the FLYBOX simulation.");
    };

    next.onclose = () => {
      const wasOpening = opening !== null;
      socket = null;
      opening = null;
      rejectPending("FLYBOX connection closed");
      if (wasOpening) reject(new Error("Could not open FLYBOX connection"));

      if (allowReconnect && frameListeners.size > 0) {
        if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = null;
          void openSocket().catch(() => {});
        }, 1000);
      }
    };
  });

  return opening;
}

async function rpc(method: string, path: string, body?: unknown) {
  const ws = await openSocket();
  const id = `${++rpcCounter}`;
  const promise = new Promise<any>((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
  ws.send(JSON.stringify({ type: "rpc", id, method, path, body }));
  return promise;
}

async function httpPost(path: string, body?: unknown) {
  const response = await fetch(API + path, {
    method: "POST",
    headers: {
      "X-Flybox-Session": SESSION_ID,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export function connectFrames(onFrame: FrameListener, onError: ErrorListener) {
  frameListeners.add(onFrame);
  errorListeners.add(onError);
  void openSocket().catch((error) => emitError(String(error)));

  return () => {
    frameListeners.delete(onFrame);
    errorListeners.delete(onError);
  };
}

export async function get(path: string) {
  return rpc("GET", path);
}

export async function post(path: string, body?: unknown) {
  // This probe is intentionally stateless and computationally isolated from the
  // live sandbox, so it does not need to be pinned to the sandbox WebSocket.
  if (path === "/api/batch/probe") return httpPost(path, body);
  return rpc("POST", path, body);
}

export async function del(path: string) {
  return rpc("DELETE", path);
}

export function closeSession() {
  allowReconnect = false;
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket?.readyState === WebSocket.OPEN) {
    try {
      socket.send(JSON.stringify({ type: "close" }));
    } catch {
      // Best effort during page teardown.
    }
    socket.close();
  }
  socket = null;
  opening = null;
  rejectPending("FLYBOX sandbox discarded");
}
