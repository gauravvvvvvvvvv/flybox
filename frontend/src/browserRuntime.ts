type RpcMethod = "GET" | "POST" | "DELETE";

type FrameListener = (frame: any) => void;
type ErrorListener = (message: string) => void;

type WorkerMessage =
  | { type: "frame"; [key: string]: unknown }
  | { type: "rpc_result"; id: string; ok: boolean; data?: unknown; error?: string }
  | { type: "error"; message: string };

let worker: Worker | null = null;
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

function ensureWorker() {
  if (worker) return worker;

  const next = new Worker(new URL("./simulation.worker.ts", import.meta.url), {
    type: "module",
    name: "flybox-simulation",
  });

  next.onmessage = (event: MessageEvent<WorkerMessage>) => {
    const message = event.data;

    if (message.type === "frame") {
      for (const listener of frameListeners) listener(message);
      return;
    }

    if (message.type === "rpc_result") {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.ok) request.resolve(message.data);
      else request.reject(new Error(message.error ?? "FLYBOX worker command failed"));
      return;
    }

    if (message.type === "error") emitError(message.message);
  };

  next.onerror = (event) => {
    emitError(event.message || "FLYBOX browser worker crashed");
  };

  worker = next;
  return next;
}

export function connectBrowserFrames(
  onFrame: FrameListener,
  onError: ErrorListener,
) {
  frameListeners.add(onFrame);
  errorListeners.add(onError);
  ensureWorker().postMessage({ type: "subscribe" });

  return () => {
    frameListeners.delete(onFrame);
    errorListeners.delete(onError);
    try {
      worker?.postMessage({ type: "unsubscribe" });
    } catch {
      // The page may already be tearing the worker down.
    }
  };
}

export async function browserRpc(
  method: RpcMethod,
  path: string,
  body?: unknown,
) {
  const id = `${++rpcCounter}`;
  const promise = new Promise<any>((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });

  ensureWorker().postMessage({ type: "rpc", id, method, path, body });
  return promise;
}

export function closeBrowserRuntime() {
  if (!worker) return;

  try {
    worker.postMessage({ type: "close" });
  } catch {
    // Best effort while the page is being discarded.
  }

  worker.terminate();
  worker = null;

  for (const request of pending.values()) {
    request.reject(new Error("FLYBOX browser sandbox discarded"));
  }
  pending.clear();
}
