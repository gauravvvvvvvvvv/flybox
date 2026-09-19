import { useEffect, useMemo, useRef, useState } from "react";
import { get } from "./api";
import type { FlyFrame } from "./types";

type StaticBrain = {
  kind: string;
  projection?: string | null;
  mapped: number;
  neurons: number;
  points: [number, number, number][];
};

type ViewMode = "3D" | "TOP" | "SIDE";

export default function BrainView({ fly }: { fly: FlyFrame | undefined }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);
  const [structure, setStructure] = useState<StaticBrain | null>(null);
  const [yaw, setYaw] = useState(-0.55);
  const [pitch, setPitch] = useState(0.34);
  const [zoom, setZoom] = useState(1.02);
  const [mode, setMode] = useState<ViewMode>("3D");

  useEffect(() => {
    if (!fly) return;
    let cancelled = false;
    get(`/api/brain/${fly.id}/sample`)
      .then((data) => { if (!cancelled) setStructure(data); })
      .catch(() => { if (!cancelled) setStructure(null); });
    return () => { cancelled = true; };
  }, [fly?.id]);

  const activity = useMemo(() => {
    const senses = fly?.senses ?? {};
    const motor = fly?.motor ?? {};
    const sensory = Math.max(0, ...Object.values(senses));
    const motorPeak = Math.max(0, ...Object.values(motor));
    return {
      sensory,
      motor: motorPeak,
      dn: fly?.dn_activity ?? 0,
      state: fly?.state ?? "IDLE",
    };
  }, [fly]);

  useEffect(() => {
    const node = canvas.current;
    if (!node || !fly) return;
    const ctx = node.getContext("2d");
    if (!ctx) return;

    const rect = node.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    node.width = Math.max(1, Math.round(rect.width * dpr));
    node.height = Math.max(1, Math.round(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = rect.width, h = rect.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#070a08";
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(183,255,90,.045)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      const x = (w / 6) * i;
      const y = (h / 6) * i;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

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

    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const project = (x: number, z: number, seed: number) => {
      let X = (x - .5) * 2;
      let Y = (z - .5) * 2;
      let Z = Math.sin(seed * 12.9898) * .18 + Math.cos(seed * .173) * .07;
      if (mode === "TOP") {
        Z = Y; Y = Math.sin(seed * .37) * .16;
      } else if (mode === "SIDE") {
        X = Math.sin(seed * .23) * .16;
      } else {
        const rx = X * cy - Z * sy;
        const rz = X * sy + Z * cy;
        const ry = Y * cp - rz * sp;
        const rz2 = Y * sp + rz * cp;
        X = rx; Y = ry; Z = rz2;
      }
      const perspective = mode === "3D" ? 1 / (1.72 - Z * .28) : 1;
      const s = Math.min(w, h) * .43 * zoom * perspective;
      return { x: w * .5 + X * s, y: h * .5 + Y * s, z: Z, p: perspective };
    };

    const pts = structure.points.map(([id, x, y]) => ({ id, ...project(x, y, id) }));
    pts.sort((a, b) => a.z - b.z);

    ctx.globalCompositeOperation = "source-over";
    for (const p of pts) {
      const alpha = .10 + Math.max(0, p.z + .3) * .05;
      ctx.fillStyle = `rgba(164,178,169,${Math.min(.24, alpha)})`;
      const r = Math.max(.55, .72 * p.p);
      ctx.fillRect(p.x, p.y, r, r);
    }

    const firing = fly.brain_view?.firing_positions ?? [];
    ctx.globalCompositeOperation = "lighter";
    for (const [id, x, y] of firing) {
      const p = project(x, y, id);
      const r = 1.8 + Math.min(2.8, (fly.dn_activity ?? 0) * 10) + p.p * .6;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3.2);
      g.addColorStop(0, "rgba(214,255,143,.95)");
      g.addColorStop(.22, "rgba(182,255,90,.78)");
      g.addColorStop(1, "rgba(182,255,90,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#dfff9d";
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(1.2, r * .42), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";

    const vignette = ctx.createRadialGradient(w*.5,h*.48,Math.min(w,h)*.1,w*.5,h*.48,Math.max(w,h)*.62);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,.62)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0,0,w,h);

    ctx.fillStyle = "#667169";
    ctx.font = "9px ui-monospace, monospace";
    ctx.fillText(`${structure.mapped.toLocaleString()} MAPPED SOMA · LIVE SIMULATED SPIKES`, 10, h - 9);
  }, [fly, structure, yaw, pitch, zoom, mode]);

  const pointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (mode !== "3D") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, yaw, pitch };
  };
  const pointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current || mode !== "3D") return;
    setYaw(drag.current.yaw + (e.clientX - drag.current.x) * .008);
    setPitch(Math.max(-1.15, Math.min(1.15, drag.current.pitch + (e.clientY - drag.current.y) * .008)));
  };
  const pointerUp = () => { drag.current = null; };
  const wheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setZoom((v) => Math.max(.65, Math.min(1.8, v - e.deltaY * .0008)));
  };

  return (
    <div className="brain-view">
      <div className="brain-view-head">
        <span>LIVE 3D CONNECTOME VIEW</span>
        <b>{fly?.brain_view?.firing_positions.length ?? 0} MAPPED SPIKES</b>
      </div>
      <div className="brain-view-controls">
        {(["3D","TOP","SIDE"] as ViewMode[]).map((item) => (
          <button key={item} className={mode === item ? "active" : ""} onClick={() => setMode(item)}>{item}</button>
        ))}
        <span />
        <button onClick={() => { setYaw(-.55); setPitch(.34); setZoom(1.02); }}>RESET VIEW</button>
      </div>
      <canvas
        ref={canvas}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={pointerUp}
        onWheel={wheel}
      />
      <div className="brain-live-strip">
        <div><span>BEHAVIOR</span><b>{activity.state}</b></div>
        <div><span>SENSORY PEAK</span><b>{activity.sensory.toFixed(3)}</b></div>
        <div><span>DN ACTIVITY</span><b>{activity.dn.toFixed(4)}</b></div>
        <div><span>MOTOR PEAK</span><b>{activity.motor.toFixed(2)}</b></div>
      </div>
      <p>
        {structure?.kind === "anatomical"
          ? "Real MaleCNS soma coordinates are spatially mapped; glow is driven by the current FlyBrain simulated firing set. Depth is a deterministic display offset because the current API exposes normalized x/z soma projection, not full morphology skeletons."
          : "No fake anatomy is rendered when coordinate metadata is unavailable."}
      </p>
    </div>
  );
}
