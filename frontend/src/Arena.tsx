import { useEffect, useRef } from "react";
import type { Frame } from "./types";

type Props = {
  frame: Frame | null;
  tool: "inspect" | "food" | "stimulus" | "loom" | "obstacle";
  onPlace: (kind: string, x: number, y: number) => void;
  onSelectFly: (id: string) => void;
};

export default function Arena({ frame, tool, onPlace, onSelectFly }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !frame) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#090c0a";
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(174,255,80,.07)";
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 32) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,h); ctx.stroke(); }
    for (let y = 0; y < h; y += 32) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }

    for (const obj of frame.world.objects) {
      const x = obj.x * w, y = obj.y * h, r = Math.max(5, obj.radius * Math.min(w,h));
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle =
        obj.kind === "food" ? "#e7dd77" :
        obj.kind === "obstacle" ? "#3c4440" :
        obj.kind === "loom" ? "#ff934d" : "#b6ff5a";
      ctx.globalAlpha = obj.kind === "obstacle" ? 0.95 : 0.65;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    for (const fly of frame.flies) {
      const x = fly.x * w, y = fly.y * h;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(fly.heading);
      ctx.shadowBlur = fly.is_prime ? 18 : 8;
      ctx.shadowColor = fly.is_prime ? "#b6ff5a" : "#c9d2cc";
      ctx.fillStyle = fly.is_prime ? "#d7ff83" : "#b8c3bc";
      ctx.beginPath();
      ctx.ellipse(0, 0, 9, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(16, 0); ctx.stroke();
      ctx.restore();

      ctx.fillStyle = fly.is_prime ? "#d7ff83" : "#9da7a1";
      ctx.font = "11px ui-monospace, monospace";
      ctx.fillText(fly.is_prime ? "PRIME" : fly.name, x + 12, y - 10);
    }
  }, [frame]);

  function click(ev: React.MouseEvent<HTMLCanvasElement>) {
    const rect = ev.currentTarget.getBoundingClientRect();
    const x = (ev.clientX - rect.left) / rect.width;
    const y = (ev.clientY - rect.top) / rect.height;
    if (tool !== "inspect") {
      onPlace(tool, x, y);
      return;
    }
    if (!frame) return;
    let best: { id: string; d: number } | null = null;
    for (const fly of frame.flies) {
      const d = Math.hypot(fly.x - x, fly.y - y);
      if (!best || d < best.d) best = { id: fly.id, d };
    }
    if (best && best.d < 0.06) onSelectFly(best.id);
  }

  return <canvas ref={ref} className="arena" onClick={click} />;
}
