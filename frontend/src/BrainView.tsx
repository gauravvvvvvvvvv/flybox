import { useEffect, useRef, useState } from "react";
import { API } from "./api";
import type { FlyFrame } from "./types";

type StaticBrain = {
  kind: string;
  projection?: string | null;
  mapped: number;
  neurons: number;
  points: [number, number, number][];
};

export default function BrainView({ fly }: { fly: FlyFrame | undefined }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [structure, setStructure] = useState<StaticBrain | null>(null);

  useEffect(() => {
    if (!fly) return;
    let cancelled = false;
    fetch(`${API}/api/brain/${fly.id}/sample`)
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data) => { if (!cancelled) setStructure(data); })
      .catch(() => { if (!cancelled) setStructure(null); });
    return () => { cancelled = true; };
  }, [fly?.id]);

  useEffect(() => {
    const node = canvas.current;
    if (!node || !fly) return;
    const ctx = node.getContext("2d");
    if (!ctx) return;

    const rect = node.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    node.width = Math.max(1, Math.round(rect.width * dpr));
    node.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.scale(dpr, dpr);
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#070a08";
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(183,255,90,.06)";
    ctx.strokeRect(.5, .5, w - 1, h - 1);

    if (!structure || structure.kind !== "anatomical") {
      ctx.fillStyle = "#667169";
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText(
        structure?.kind === "mock-unavailable" ? "ANATOMICAL VIEW UNAVAILABLE IN MOCK MODE" : "NO USABLE SOMA POSITIONS",
        12,
        22,
      );
      return;
    }

    const pad = 12;
    const px = (x: number) => pad + x * (w - pad * 2);
    const py = (y: number) => pad + y * (h - pad * 2);

    ctx.fillStyle = "rgba(164,178,169,.14)";
    for (const [, x, y] of structure.points) {
      ctx.fillRect(px(x), py(y), 1, 1);
    }

    const firing = fly.brain_view?.firing_positions ?? [];
    ctx.shadowBlur = 5;
    ctx.shadowColor = "#b6ff5a";
    ctx.fillStyle = "#caff76";
    for (const [, x, y] of firing) {
      ctx.beginPath();
      ctx.arc(px(x), py(y), 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    ctx.fillStyle = "#627068";
    ctx.font = "9px ui-monospace, monospace";
    ctx.fillText(`${structure.mapped.toLocaleString()} SOMA POSITIONS · X/Z PROJECTION`, 10, h - 8);
  }, [fly, structure]);

  return (
    <div className="brain-view">
      <div className="brain-view-head">
        <span>LIVE CONNECTOME VIEW</span>
        <b>{fly?.brain_view?.firing_positions.length ?? 0} MAPPED SPIKES</b>
      </div>
      <canvas ref={canvas} />
      <p>
        {structure?.kind === "anatomical"
          ? "Real MaleCNS soma coordinates; only a bounded structural sample and recent firing positions are rendered."
          : "No fake anatomy is rendered when coordinate metadata is unavailable."}
      </p>
    </div>
  );
}
