import {
  browserRpc,
  closeBrowserRuntime,
  connectBrowserFrames,
} from "./browserRuntime";

export const RUNTIME_MODE = "browser" as const;

type FrameListener = (frame: any) => void;
type ErrorListener = (message: string) => void;

export function connectFrames(onFrame: FrameListener, onError: ErrorListener) {
  return connectBrowserFrames(onFrame, onError);
}

export async function get(path: string) {
  return browserRpc("GET", path);
}

export async function post(path: string, body?: unknown) {
  return browserRpc("POST", path, body);
}

export async function del(path: string) {
  return browserRpc("DELETE", path);
}

export function closeSession() {
  closeBrowserRuntime();
}
