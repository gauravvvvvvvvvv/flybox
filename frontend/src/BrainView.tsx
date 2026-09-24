import { useEffect, useMemo, useRef, useState } from "react";
import { get } from "./api";
import type { FlyFrame } from "./types";

type StaticBrain = {
  kind: string;
  projection?: string | null;
  mapped: number;
  neurons: number;
  points: [number, number, number, number][];
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
  const [showGrid, setShowGrid] = useState(true);
  const [showStructure, setShowStructure] = useState(true);
  const [showSpikes, setShowSpikes] = useState(true);
  const [expanded, setExpanded] = useState(false);

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
    const sensoryEntries = Object.entries(senses);
    const motorEntries = Object.entries(motor);
    const sensoryPeak: [string, number] = sensoryEntries.sort((a, b) => b[1] - a[1])[0] ?? ["none", 0];
    const motorPeak: [string, number] = motorEntries.sort((a, b) => b[1] - a[1])[0] ?? ["none", 0];
    return {
      sensory: sensoryPeak[1],
      sensoryName: sensoryPeak[0],
      motor: motorPeak[1],
      motorName: motorPeak[0],
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

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#08100b");
    bg.addColorStop(.55, "#060a08");
    bg.addColorStop(1, "#040605");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    if (showGrid) {
      ctx.strokeStyle = "rgba(183,255,90,.045)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 8; i++) {
        const x = (w / 8) * i;
        const y = (h / 8) * i;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      ctx.strokeStyle = "rgba(183,255,90,.08)";
      ctx.beginPath(); ctx.moveTo(w * .5, 0); ctx.lineTo(w * .5, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, h * .5); ctx.lineTo(w, h * .5); ctx.stroke();
    }

    if (!structure || structure.kind !== "anatomical") {
      ctx.fillStyle = "#667169";
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText(
        structure?.kind === "mock-unavailable" ? "ANATOMICAL VIEW UNAVAILABLE IN MOCK MODE" : "NO USABLE SOMA POSITIONS",
        16,
        28,
      );
      return;
    }

    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const project = (x: number, y: number, z: number) => {
      let X = (x - .5) * 2;
      let Y = (z - .5) * 2;
      let Z = (y - .5) * 2;
      if (mode === "TOP") {
        Y = Z; Z = 0;
      } else if (mode === "SIDE") {
        X = Z; Z = 0;
      } else {
        const rx = X * cy - Z * sy;
        const rz = X * sy + Z * cy;
        const ry = Y * cp - rz * sp;
        const rz2 = Y * sp + rz * cp;
        X = rx; Y = ry; Z = rz2;
      }
      const perspective = mode === "3D" ? 1 / (1.72 - Z * .28) : 1;
      const s = Math.min(w, h) * .45 * zoom * perspective;
      return { x: w * .5 + X * s, y: h * .5 + Y * s, z: Z, p: perspective };
    };

    if (showStructure) {
      const pts = structure.points.map(([id, x, y, z]) => ({ id, ...project(x, y, z) }));
      pts.sort((a, b) => a.z - b.z);

      ctx.globalCompositeOperation = "source-over";
      for (const p of pts) {
        const depth = Math.max(0, Math.min(1, (p.z + 1) * .5));
        const alpha = .06 + depth * .13;
        ctx.fillStyle = `rgba(174,191,180,${alpha})`;
        const r = Math.max(.55, .78 * p.p);
        ctx.fillRect(p.x, p.y, r, r);
      }
    }

    const firing = fly.brain_view?.firing_positions ?? [];
    if (showSpikes) {
      ctx.globalCompositeOperation = "lighter";
      for (const [, x, y, z] of firing) {
        const p = project(x, y, z);
        const r = 1.45 + Math.min(2.6, (fly.dn_activity ?? 0) * 10) + p.p * .55;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 4);
        g.addColorStop(0, "rgba(233,255,194,1)");
        g.addColorStop(.18, "rgba(198,255,112,.92)");
        g.addColorStop(.48, "rgba(145,234,65,.30)");
        g.addColorStop(1, "rgba(182,255,90,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#e8ffc2";
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1.0, r * .37), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    }

    const vignette = ctx.createRadialGradient(w*.5,h*.48,Math.min(w,h)*.08,w*.5,h*.48,Math.max(w,h)*.65);
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,.68)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0,0,w,h);
  }, [fly, structure, yaw, pitch, zoom, mode, showGrid, showStructure, showSpikes, expanded]);

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
    setZoom((v) => Math.max(.65, Math.min(1.9, v - e.deltaY * .0008)));
  };

  const reset = () => {
    setYaw(-.55);
    setPitch(.34);
    setZoom(1.02);
    setMode("3D");
  };

  return (
    <div className={expanded ? "brain-view brain-view-expanded" : "brain-view"}>
      <div className="brain-view-head brain-view-head-pro">
        <div>
          <span>MALECNS / LIVE NEURAL ACTIVITY</span>
          <strong>3D CONNECTOME INSPECTOR</strong>
        </div>
        <div className="brain-head-stats">
          <span><i className="brain-dot brain-dot-static" />{structure?.mapped.toLocaleString() ?? "—"} MAPPED SOMA</span>
          <span><i className="brain-dot brain-dot-live" />{fly?.brain_view?.firing_positions.length ?? 0} LIVE SPIKES</span>
        </div>
      </div>

      <div className="brain-view-controls brain-toolbar-pro">
        <div className="brain-segment">
          {(["3D","TOP","SIDE"] as ViewMode[]).map((item) => (
            <button key={item} className={mode === item ? "active" : ""} onClick={() => setMode(item)}>{item}</button>
          ))}
        </div>
        <div className="brain-layer-toggles">
          <button className={showStructure ? "active" : ""} onClick={() => setShowStructure(!showStructure)}>SOMA</button>
          <button className={showSpikes ? "active" : ""} onClick={() => setShowSpikes(!showSpikes)}>SPIKES</button>
          <button className={showGrid ? "active" : ""} onClick={() => setShowGrid(!showGrid)}>GRID</button>
        </div>
        <span />
        <button onClick={reset}>RESET</button>
        <button onClick={() => setExpanded(!expanded)}>{expanded ? "COLLAPSE" : "EXPAND"}</button>
      </div>

      <div className="brain-canvas-wrap">
        <canvas
          ref={canvas}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={pointerUp}
          onPointerCancel={pointerUp}
          onWheel={wheel}
        />
        <div className="brain-hud brain-hud-left">
          <span>VIEW</span><b>{mode}</b>
          <span>ZOOM</span><b>{zoom.toFixed(2)}×</b>
          <span>CAMERA</span><b>{mode === "3D" ? "DRAG / WHEEL" : "ORTHO"}</b>
        </div>
        <div className="brain-hud brain-hud-right">
          <span>ANATOMY</span><b>{structure?.kind === "anatomical" ? "REAL XYZ SOMA" : "UNAVAILABLE"}</b>
          <span>ACTIVITY</span><b>SIMULATED SPIKES</b>
          <span>GRAPH</span><b>BROWSER WORKER</b>
        </div>
        <div className="brain-axis">
          <span className="axis-x">X</span><span className="axis-y">Y</span><span className="axis-z">Z</span>
        </div>
      </div>

      <div className="brain-live-strip brain-live-strip-pro">
        <div><span>BEHAVIOR</span><b>{activity.state}</b></div>
        <div><span>SENSORY PEAK</span><b>{activity.sensoryName} · {activity.sensory.toFixed(3)}</b></div>
        <div><span>DN ACTIVITY</span><b>{activity.dn.toFixed(4)}</b></div>
        <div><span>MOTOR PEAK</span><b>{activity.motorName} · {activity.motor.toFixed(2)}</b></div>
      </div>

      <div className="brain-legend">
        <span><i className="brain-dot brain-dot-static" /> MaleCNS soma sample</span>
        <span><i className="brain-dot brain-dot-live" /> currently firing mapped neuron</span>
        <span className="brain-legend-note">real MaleCNS graph · FlyBrain web-quantized weights · local browser compute</span>
      </div>

      <p>
        {structure?.kind === "anatomical"
          ? "Real MaleCNS x/y/z soma coordinates are rendered directly. Glow follows the current FlyBrain simulated firing set. This is true 3D soma anatomy; full axon/dendrite morphology is not yet loaded into the browser."
          : "No fake anatomy is rendered when coordinate metadata is unavailable."}
      </p>
    </div>
  );
}
