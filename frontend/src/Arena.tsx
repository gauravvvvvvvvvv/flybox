import { useEffect, useMemo, useRef, useState } from "react";
import type { Frame, WorldKind } from "./types";

export type ArenaTool = "inspect" | WorldKind;

type Props = {
  frame: Frame | null;
  tool: ArenaTool;
  selectedFly: string;
  neuralOverlay: boolean;
  onPlace: (kind: WorldKind, x: number, y: number) => void;
  onMoveObject: (id: string, x: number, y: number) => void;
  onMoveFly: (id: string, x: number, y: number) => void;
  onRemoveObject: (id: string) => void;
  onSelectFly: (id: string) => void;
};

export default function Arena({
  frame,
  tool,
  selectedFly,
  neuralOverlay,
  onPlace,
  onMoveObject,
  onMoveFly,
  onRemoveObject,
  onSelectFly,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dragObject = useRef<string | null>(null);
  const dragFly = useRef<string | null>(null);
  const lastPaint = useRef(0);
  const [zoom, setZoom] = useState(1);

  const cameraCenter = useMemo(() => {
    const selected = frame?.flies.find((fly) => fly.id === selectedFly);
    return selected ? { x: selected.x, y: selected.y } : { x: 0.5, y: 0.5 };
  }, [frame, selectedFly]);

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

    const w = rect.width;
    const h = rect.height;
    ctx.clearRect(0, 0, w, h);

    // Camera: zoom around the selected fly so it remains easy to follow.
    // At 1× the whole normalized arena is visible. Higher zoom levels follow
    // the selected fly without making the page itself larger.
    const cameraX = cameraCenter.x * w;
    const cameraY = cameraCenter.y * h;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-cameraX, -cameraY);

    const daylight = frame.world.daylight ?? 1;
    const shade = Math.round(8 + daylight * 10);
    ctx.fillStyle = `rgb(${shade - 1},${shade + 2},${shade})`;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "rgba(174,255,80,.055)";
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 32) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += 32) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    for (const obj of frame.world.objects) drawObject(ctx, obj, w, h, frame.t);
    drawObjectLabels(ctx, frame.world.objects, w, h);

    for (const fly of frame.flies) {
      if (fly.trail?.length > 1) {
        ctx.beginPath();
        fly.trail.forEach((p, i) => {
          const px = p.x * w, py = p.y * h;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.strokeStyle = fly.id === selectedFly ? "rgba(183,255,90,.34)" : "rgba(190,200,194,.12)";
        ctx.lineWidth = fly.id === selectedFly ? 1.5 : 1;
        ctx.stroke();
      }

      const x = fly.x * w;
      const y = fly.y * h;

      if (neuralOverlay && fly.alive) {
        const sparks = Math.min(42, Math.max(4, Math.round(fly.fired_count / 450)));
        for (let i = 0; i < sparks; i++) {
          const neuron = fly.sampled_fired[i % Math.max(1, fly.sampled_fired.length)] ?? i;
          const angle = ((neuron * 0.61803398875) % 1) * Math.PI * 2;
          const radius = 12 + ((neuron * 17) % 28);
          ctx.fillStyle = `rgba(183,255,90,${0.10 + (i % 5) * 0.025})`;
          ctx.fillRect(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, 1.5, 1.5);
        }
      }

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(fly.heading);
      ctx.globalAlpha = fly.alive ? 1 : 0.32;
      ctx.shadowBlur = fly.id === selectedFly ? 18 : 7;
      ctx.shadowColor = fly.id === selectedFly ? "#b6ff5a" : "#c8d1cb";
      drawBody(ctx, fly.body_type, fly.is_prime);
      ctx.restore();

      ctx.fillStyle = fly.id === selectedFly ? "#dcff9e" : "#9da7a1";
      ctx.font = "11px ui-monospace, monospace";
      ctx.fillText(fly.name, x + 13, y - 11);
      ctx.fillStyle = fly.state === "ESCAPING" ? "#ff9a65" : "#67736b";
      ctx.font = "9px ui-monospace, monospace";
      ctx.fillText(fly.state, x + 13, y + 3);
    }

    ctx.restore();

    if (frame.challenge.id !== "sandbox") {
      ctx.fillStyle = "rgba(7,9,8,.80)";
      ctx.fillRect(12, 12, Math.min(360, w - 24), 56);
      ctx.strokeStyle = frame.challenge.completed ? "#b6ff5a" : "#39423d";
      ctx.strokeRect(12, 12, Math.min(360, w - 24), 56);
      ctx.fillStyle = "#dce4df";
      ctx.font = "700 12px ui-monospace, monospace";
      ctx.fillText(frame.challenge.name.toUpperCase(), 24, 34);
      ctx.fillStyle = "#7f8b83";
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText(
        frame.challenge.completed ? "COMPLETE" : frame.challenge.description.slice(0, 52),
        24,
        52,
      );
    }
  }, [frame, selectedFly, neuralOverlay, zoom, cameraCenter]);

  function screenToWorld(clientX: number, clientY: number, rect: DOMRect) {
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const cameraX = cameraCenter.x * rect.width;
    const cameraY = cameraCenter.y * rect.height;

    const worldPxX = cameraX + (sx - rect.width / 2) / zoom;
    const worldPxY = cameraY + (sy - rect.height / 2) / zoom;

    return {
      x: Math.max(0, Math.min(1, worldPxX / rect.width)),
      y: Math.max(0, Math.min(1, worldPxY / rect.height)),
    };
  }

  function worldToScreen(x: number, y: number, rect: DOMRect) {
    const cameraX = cameraCenter.x * rect.width;
    const cameraY = cameraCenter.y * rect.height;
    return {
      x: rect.width / 2 + (x * rect.width - cameraX) * zoom,
      y: rect.height / 2 + (y * rect.height - cameraY) * zoom,
    };
  }

  function point(ev: React.PointerEvent<HTMLCanvasElement>) {
    const rect = ev.currentTarget.getBoundingClientRect();
    return screenToWorld(ev.clientX, ev.clientY, rect);
  }

  function onContextMenu(ev: React.MouseEvent<HTMLCanvasElement>) {
    ev.preventDefault();
    ev.stopPropagation();
    if (!frame) return;

    const rect = ev.currentTarget.getBoundingClientRect();
    const mouseX = ev.clientX - rect.left;
    const mouseY = ev.clientY - rect.top;
    const arenaScale = Math.min(rect.width, rect.height) * zoom;

    // Hit-test against the same size the canvas actually renders. The extra
    // padding makes small items such as sound/light/odor easy to remove while
    // still choosing the nearest object when elements overlap.
    let hit: { id: string; distancePx: number } | null = null;
    for (const obj of frame.world.objects) {
      const screen = worldToScreen(obj.x, obj.y, rect);
      const objectX = screen.x;
      const objectY = screen.y;
      const distancePx = Math.hypot(objectX - mouseX, objectY - mouseY);
      const renderedRadiusPx = Math.max(5, obj.radius * arenaScale);
      const hitRadiusPx = Math.max(14, renderedRadiusPx + 10);

      if (
        distancePx <= hitRadiusPx &&
        (!hit || distancePx < hit.distancePx)
      ) {
        hit = { id: obj.id, distancePx };
      }
    }

    if (hit) onRemoveObject(hit.id);
  }

  function onPointerDown(ev: React.PointerEvent<HTMLCanvasElement>) {
    // Only the primary/left button can place, select or drag. Right-click is
    // reserved exclusively for deleting world elements.
    if (ev.button !== 0) return;

    const p = point(ev);
    if (tool !== "inspect") {
      onPlace(tool, p.x, p.y);
      return;
    }
    if (!frame) return;

    let flyHit: { id: string; d: number } | null = null;
    for (const fly of frame.flies) {
      const d = Math.hypot(fly.x - p.x, fly.y - p.y);
      if (!flyHit || d < flyHit.d) flyHit = { id: fly.id, d };
    }
    if (flyHit && flyHit.d < 0.05) {
      onSelectFly(flyHit.id);
      dragFly.current = flyHit.id;
      ev.currentTarget.setPointerCapture(ev.pointerId);
      return;
    }

    let objHit: { id: string; d: number } | null = null;
    for (const obj of frame.world.objects) {
      const d = Math.hypot(obj.x - p.x, obj.y - p.y);
      if (!objHit || d < objHit.d) objHit = { id: obj.id, d };
    }
    if (objHit && objHit.d < 0.055) {
      dragObject.current = objHit.id;
      ev.currentTarget.setPointerCapture(ev.pointerId);
    }
  }

  function onPointerMove(ev: React.PointerEvent<HTMLCanvasElement>) {
    const p = point(ev);
    if (dragFly.current) {
      onMoveFly(dragFly.current, p.x, p.y);
      return;
    }
    if (dragObject.current) {
      onMoveObject(dragObject.current, p.x, p.y);
      return;
    }
    if (tool === "odor" && (ev.buttons & 1) === 1) {
      const now = performance.now();
      if (now - lastPaint.current > 90) {
        lastPaint.current = now;
        onPlace("odor", p.x, p.y);
      }
    }
  }

  function onPointerUp(ev: React.PointerEvent<HTMLCanvasElement>) {
    if (dragObject.current || dragFly.current) {
      dragObject.current = null;
      dragFly.current = null;
      if (ev.currentTarget.hasPointerCapture(ev.pointerId)) {
        ev.currentTarget.releasePointerCapture(ev.pointerId);
      }
    }
  }

  return (
    <div className="arena-viewport">
      <canvas
        ref={ref}
        className="arena"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={onContextMenu}
      />
      <div className="arena-zoom" aria-label="Arena zoom controls">
        <button
          type="button"
          title="Zoom out"
          onClick={() => setZoom((value) => Math.max(1, Number((value - 0.5).toFixed(1))))}
          disabled={zoom <= 1}
        >
          −
        </button>
        <span>{zoom.toFixed(1)}×</span>
        <button
          type="button"
          title="Zoom in"
          onClick={() => setZoom((value) => Math.min(4, Number((value + 0.5).toFixed(1))))}
          disabled={zoom >= 4}
        >
          +
        </button>
        <button type="button" title="Reset zoom" onClick={() => setZoom(1)}>
          FIT
        </button>
      </div>
    </div>
  );
}

function drawObject(ctx: CanvasRenderingContext2D, obj: Frame["world"]["objects"][number], w: number, h: number, t: number) {
  const x = obj.x * w;
  const y = obj.y * h;
  const r = Math.max(5, obj.radius * Math.min(w, h));

  if (obj.kind === "food" || obj.kind === "odor") {
    for (let ring = 4; ring >= 1; ring--) {
      ctx.beginPath();
      ctx.arc(x, y, r + ring * 22, 0, Math.PI * 2);
      ctx.strokeStyle = obj.kind === "odor" ? `rgba(146,255,156,${0.024 * (5 - ring)})` : `rgba(231,221,119,${0.018 * (5 - ring)})`;
      ctx.stroke();
    }
  }

  if (obj.kind === "sound") {
    for (let ring = 1; ring <= 3; ring++) {
      const pulse = ((t * 45 + ring * 18) % 65);
      ctx.beginPath();
      ctx.arc(x, y, r + pulse, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(114,181,255,${0.16 - ring * 0.025})`;
      ctx.stroke();
    }
  }

  if (obj.kind === "light") {
    const gradient = ctx.createRadialGradient(x, y, 1, x, y, r * 5);
    gradient.addColorStop(0, "rgba(255,247,190,.42)");
    gradient.addColorStop(1, "rgba(255,247,190,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(x - r * 5, y - r * 5, r * 10, r * 10);
  }

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle =
    obj.kind === "food" ? "#e7dd77" :
    obj.kind === "obstacle" ? "#3c4440" :
    obj.kind === "loom" ? "#ff934d" :
    obj.kind === "predator" ? "#ff6157" :
    obj.kind === "sound" ? "#72b5ff" :
    obj.kind === "light" ? "#fff3ad" :
    obj.kind === "goal" ? "#66ffd1" : "#b6ff5a";
  ctx.globalAlpha = obj.kind === "obstacle" ? 0.96 : 0.75;
  ctx.fill();
  ctx.globalAlpha = 1;

  if (obj.kind === "predator") {
    ctx.strokeStyle = "#ff8a82";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - r * 1.4, y - r * 1.4);
    ctx.lineTo(x + r * 1.4, y + r * 1.4);
    ctx.moveTo(x + r * 1.4, y - r * 1.4);
    ctx.lineTo(x - r * 1.4, y + r * 1.4);
    ctx.stroke();
  }
}

function drawObjectLabels(
  ctx: CanvasRenderingContext2D,
  objects: Frame["world"]["objects"],
  w: number,
  h: number,
) {
  const odorObjects = objects.filter((obj) => obj.kind === "odor");
  const odorLabelIds = new Set(
    odorObjects
      .filter((_, index) => index % Math.max(1, Math.ceil(odorObjects.length / 4)) === 0)
      .map((obj) => obj.id),
  );

  for (const obj of objects) {
    if (obj.kind === "odor" && !odorLabelIds.has(obj.id)) continue;

    const x = obj.x * w;
    const y = obj.y * h;
    const label = objectLabel(obj);
    ctx.font = "700 9px ui-monospace, monospace";
    const textWidth = ctx.measureText(label).width;
    const boxW = textWidth + 10;
    const boxH = 16;
    const left = Math.min(w - boxW - 4, Math.max(4, x - boxW / 2));
    const top = Math.min(h - boxH - 4, Math.max(4, y - Math.max(18, obj.radius * Math.min(w, h) + 19)));

    ctx.fillStyle = "rgba(5,8,6,.82)";
    ctx.fillRect(left, top, boxW, boxH);
    ctx.strokeStyle = "rgba(205,224,211,.18)";
    ctx.strokeRect(left + .5, top + .5, boxW - 1, boxH - 1);
    ctx.fillStyle = "#c7d2ca";
    ctx.fillText(label, left + 5, top + 11);
  }
}

function objectLabel(obj: Frame["world"]["objects"][number]) {
  if (obj.label) return obj.label.toUpperCase();
  return ({
    food: "FRUIT",
    odor: "ODOR",
    stimulus: "TARGET",
    obstacle: "WALL",
    loom: "LOOM",
    sound: "SOUND",
    predator: "PREDATOR",
    light: "LIGHT",
    goal: "GOAL",
  } as Record<string, string>)[obj.kind] ?? obj.kind.toUpperCase();
}

function drawBody(ctx: CanvasRenderingContext2D, body: string, prime: boolean) {
  const fill = prime ? "#d7ff83" : "#bcc7c0";
  ctx.fillStyle = fill;
  ctx.strokeStyle = "#0a0d0b";
  ctx.lineWidth = 2;

  if (body === "car") {
    ctx.fillRect(-9, -6, 18, 12);
    ctx.fillStyle = "#111";
    ctx.fillRect(-7, -9, 4, 3); ctx.fillRect(3, -9, 4, 3);
    ctx.fillRect(-7, 6, 4, 3); ctx.fillRect(3, 6, 4, 3);
  } else if (body === "bot") {
    ctx.fillRect(-7, -7, 14, 14);
    ctx.fillStyle = "#111";
    ctx.fillRect(2, -3, 3, 3);
  } else if (body === "drone") {
    ctx.fillRect(-4, -4, 8, 8);
    ctx.strokeStyle = fill;
    ctx.beginPath();
    ctx.moveTo(-12, -12); ctx.lineTo(12, 12);
    ctx.moveTo(12, -12); ctx.lineTo(-12, 12);
    ctx.stroke();
  } else if (body === "walker") {
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = fill;
    for (const a of [-2.4, -1.6, -.8, .8, 1.6, 2.4]) {
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 5, Math.sin(a) * 5);
      ctx.lineTo(Math.cos(a) * 13, Math.sin(a) * 13);
      ctx.stroke();
    }
  } else if (body === "ship") {
    ctx.beginPath();
    ctx.moveTo(12, 0); ctx.lineTo(-8, -7); ctx.lineTo(-4, 0); ctx.lineTo(-8, 7);
    ctx.closePath(); ctx.fill();
  } else if (body === "synth") {
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#111";
    ctx.fillRect(-5, -2, 10, 4);
  } else {
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(16, 0); ctx.stroke();
  }
}
