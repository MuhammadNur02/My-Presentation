import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import type { LayerInfo } from '../../engine/layers';
import { useProjectStore } from '../../store/projectStore';
import { useUIStore } from '../../store/uiStore';
import type { LayoutOverride } from '../../types';
import { cn } from '../../utils/cn';

const W = 1920;
const H = 1080;
const SNAP = 10; // ambang tarikan pemandu (px logis)
const MIN = 48;

type Handle = 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

const HANDLE_POS: Record<Exclude<Handle, 'move'>, { x: number; y: number; cursor: string }> = {
  nw: { x: 0, y: 0, cursor: 'nwse-resize' },
  n: { x: 0.5, y: 0, cursor: 'ns-resize' },
  ne: { x: 1, y: 0, cursor: 'nesw-resize' },
  e: { x: 1, y: 0.5, cursor: 'ew-resize' },
  se: { x: 1, y: 1, cursor: 'nwse-resize' },
  s: { x: 0.5, y: 1, cursor: 'ns-resize' },
  sw: { x: 0, y: 1, cursor: 'nesw-resize' },
  w: { x: 0, y: 0.5, cursor: 'ew-resize' },
};

const CORNERS: Handle[] = ['nw', 'ne', 'se', 'sw'];
const EDGES_H: Handle[] = ['e', 'w'];

function handlesFor(edit: LayerInfo['edit']): Exclude<Handle, 'move'>[] {
  if (edit === 'text') return [...EDGES_H, ...CORNERS] as Exclude<Handle, 'move'>[];
  if (edit === 'lock') return CORNERS as Exclude<Handle, 'move'>[];
  return ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
}

interface Drag {
  layer: LayerInfo;
  handle: Handle;
  sx: number;
  sy: number;
  moved: boolean;
  startScale: number;
  targetsX: number[];
  targetsY: number[];
}

/** Titik tarik pemandu: tepi/pusat slide, margin standar, dan tepi/pusat elemen lain. */
function snapTargets(layers: LayerInfo[], selfId: string): { x: number[]; y: number[] } {
  const x = [0, 120, W / 2, W - 120, W];
  const y = [0, 60, H / 2, H - 60, H];
  for (const l of layers) {
    if (l.id === selfId) continue;
    x.push(l.rect.x, l.rect.x + l.rect.w / 2, l.rect.x + l.rect.w);
    y.push(l.rect.y, l.rect.y + l.rect.h / 2, l.rect.y + l.rect.h);
  }
  return { x, y };
}

/** Geser `pos` (yang mengandung titik-titik `edges` relatif) agar salah satunya menempel ke target terdekat. */
function snapAxis(pos: number, offsets: number[], targets: number[]): { pos: number; guide: number | null } {
  let best = SNAP + 1;
  let delta = 0;
  let guide: number | null = null;
  for (const off of offsets) {
    for (const t of targets) {
      const d = t - (pos + off);
      if (Math.abs(d) < best) {
        best = Math.abs(d);
        delta = d;
        guide = t;
      }
    }
  }
  return best <= SNAP ? { pos: pos + delta, guide } : { pos, guide: null };
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/**
 * Sorotan + kontrol edit manual untuk elemen terpilih di Live Monitor: geser (dengan pemandu tarik),
 * ubah ukuran lewat pegangan (teks: lebar bungkus & skala font; foto/kartu: bebas; logo/lencana: rasio terkunci),
 * dan panah keyboard untuk menggeser presisi. Setiap perubahan disimpan sebagai `Slide.overrides` (bisa di-undo).
 */
export function LayerOverlay({
  layers,
  slideId,
  containerRef,
  hoverId,
  pick,
}: {
  layers: LayerInfo[];
  slideId: string;
  containerRef: RefObject<HTMLDivElement | null>;
  hoverId: string | null;
  pick: (e: { clientX: number; clientY: number }) => LayerInfo | null;
}) {
  const selectedId = useUIStore((s) => s.selectedLayer);
  const selectedRole = useUIStore((s) => s.selectedRole);
  const layer = layers.find((l) => l.id === selectedId) ?? null;
  const hover = hoverId && hoverId !== selectedId ? layers.find((l) => l.id === hoverId) ?? null : null;
  const [guides, setGuides] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  const [dragging, setDragging] = useState(false);

  const layersRef = useRef(layers);
  layersRef.current = layers;
  const drag = useRef<Drag | null>(null);
  const pending = useRef<Partial<LayoutOverride> | null>(null);
  const raf = useRef(0);

  const flush = () => {
    raf.current = 0;
    const d = drag.current;
    if (!d || !pending.current) return;
    useProjectStore.getState().setOverride(slideId, d.layer.id, pending.current);
    pending.current = null;
  };
  const queue = (patch: Partial<LayoutOverride>) => {
    pending.current = patch;
    if (!raf.current) raf.current = requestAnimationFrame(flush);
  };

  const scaleK = () => {
    const box = containerRef.current?.getBoundingClientRect();
    return box && box.width ? box.width / W : 1;
  };

  const compute = (ev: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const k = scaleK();
    const dx = (ev.clientX - d.sx) / k;
    const dy = (ev.clientY - d.sy) / k;
    if (!d.moved && Math.hypot(dx, dy) * k < 3) return;
    if (!d.moved) {
      d.moved = true;
      setDragging(true);
    }
    const s = d.layer.rect;
    const edit = d.layer.edit;
    const snapOn = !ev.altKey;
    let { x, y, w, h } = s;
    let gx: number | null = null;
    let gy: number | null = null;

    if (d.handle === 'move') {
      x = s.x + dx;
      y = s.y + dy;
      if (snapOn) {
        const sx = snapAxis(x, [0, w / 2, w], d.targetsX);
        const sy = snapAxis(y, [0, h / 2, h], d.targetsY);
        x = sx.pos;
        y = sy.pos;
        gx = sx.guide;
        gy = sy.guide;
      }
      queue({ x: Math.round(x), y: Math.round(y) });
    } else if (edit === 'text') {
      if (d.handle === 'e' || d.handle === 'w') {
        if (d.handle === 'e') w = Math.max(120, s.w + dx);
        else {
          w = Math.max(120, s.w - dx);
          x = s.x + s.w - w;
        }
        queue({ x: Math.round(x), w: Math.round(w) });
      } else {
        // Sudut = skala font: tarik menjauhi pusat untuk membesarkan.
        const hx = d.handle.includes('e') ? 1 : -1;
        const hy = d.handle.includes('s') ? 1 : -1;
        const rel = 1 + ((hx * dx + hy * dy) / (s.w + s.h)) * 2;
        queue({ scale: Math.round(clamp(d.startScale * rel, 0.3, 5) * 100) / 100 });
      }
    } else {
      const hx = d.handle.includes('e') ? 1 : d.handle.includes('w') ? -1 : 0;
      const hy = d.handle.includes('s') ? 1 : d.handle.includes('n') ? -1 : 0;
      if (edit === 'lock' || (ev.shiftKey && hx !== 0 && hy !== 0)) {
        // Rasio terkunci: ukuran mengikuti sumbu yang paling banyak digeser.
        const rel = clamp(1 + Math.max(hx * dx, hy * dy * (s.w / s.h)) / s.w, MIN / s.w, 8);
        w = s.w * rel;
        h = s.h * rel;
        x = hx < 0 ? s.x + s.w - w : s.x;
        y = hy < 0 ? s.y + s.h - h : s.y;
      } else {
        if (hx > 0) w = Math.max(MIN, s.w + dx);
        if (hx < 0) {
          w = Math.max(MIN, s.w - dx);
          x = s.x + s.w - w;
        }
        if (hy > 0) h = Math.max(MIN, s.h + dy);
        if (hy < 0) {
          h = Math.max(MIN, s.h - dy);
          y = s.y + s.h - h;
        }
      }
      queue({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
    }
    setGuides((g) => (g.x === gx && g.y === gy ? g : { x: gx, y: gy }));
  };

  const start = (e: ReactPointerEvent, l: LayerInfo, handle: Handle) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const t = snapTargets(layersRef.current, l.id);
    drag.current = {
      layer: l,
      handle,
      sx: e.clientX,
      sy: e.clientY,
      moved: false,
      startScale: useProjectStore.getState().project?.slides.find((s) => s.id === slideId)?.overrides?.[l.id]?.scale ?? 1,
      targetsX: t.x,
      targetsY: t.y,
    };
    const onMove = (ev: PointerEvent) => compute(ev);
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      const d = drag.current;
      // Browser boleh menunda pointermove terakhir sampai frame berikutnya; pointerup membawa posisi akhir yang pasti.
      compute(ev);
      if (raf.current) cancelAnimationFrame(raf.current);
      flush();
      drag.current = null;
      setDragging(false);
      setGuides({ x: null, y: null });
      // Klik tanpa geser pada kotak terpilih → pilih elemen lain di bawah kursor (kotak menutupi elemen di belakangnya).
      if (d && !d.moved && d.handle === 'move') {
        const hit = pick(ev);
        const ui = useUIStore.getState();
        if (hit && hit.id !== d.layer.id) {
          ui.selectLayer(hit.id);
          ui.selectRole(hit.motionRole);
        }
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  useEffect(
    () => () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    },
    [],
  );

  // Panah = geser 1 px (Shift = 10 px); Esc = lepas pilihan.
  useEffect(() => {
    if (!layer) return;
    const onKey = (e: KeyboardEvent) => {
      // Mode presentasi & dialog memakai panah/Esc untuk keperluannya sendiri — jangan ikut menggeser elemen.
      const ui = useUIStore.getState();
      if (ui.presenting || ui.modal) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === 'Escape') {
        useUIStore.getState().selectLayer(null);
        return;
      }
      const step = e.shiftKey ? 10 : 1;
      const dir: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      const v = dir[e.key];
      if (!v || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      useProjectStore.getState().setOverride(slideId, layer.id, { x: Math.round(layer.rect.x + v[0]), y: Math.round(layer.rect.y + v[1]) });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [layer, slideId]);

  const box = (r: LayerInfo['rect']) => ({
    left: `${(r.x / W) * 100}%`,
    top: `${(r.y / H) * 100}%`,
    width: `${(r.w / W) * 100}%`,
    height: `${(r.h / H) * 100}%`,
  });

  // Tanpa pilihan elemen tunggal: sorot seluruh peran (mis. dari panel Gerak).
  const roleBox =
    !layer && selectedRole
      ? layers.filter((l) => l.motionRole === selectedRole).reduce(
          (b, l) => ({
            x0: Math.min(b.x0, l.rect.x),
            y0: Math.min(b.y0, l.rect.y),
            x1: Math.max(b.x1, l.rect.x + l.rect.w),
            y1: Math.max(b.y1, l.rect.y + l.rect.h),
          }),
          { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity },
        )
      : null;

  return (
    <>
      {hover && !dragging && <div className="pointer-events-none absolute rounded-md border-2 border-dashed border-white/70" style={box(hover.rect)} />}

      {roleBox && Number.isFinite(roleBox.x0) && (
        <div
          className="pointer-events-none absolute rounded-md border-2 border-accent bg-accent/5"
          style={box({ x: roleBox.x0, y: roleBox.y0, w: roleBox.x1 - roleBox.x0, h: roleBox.y1 - roleBox.y0 })}
        />
      )}

      {dragging && guides.x !== null && <div className="pointer-events-none absolute inset-y-0 w-px bg-fuchsia-400/90" style={{ left: `${(guides.x / W) * 100}%` }} />}
      {dragging && guides.y !== null && <div className="pointer-events-none absolute inset-x-0 h-px bg-fuchsia-400/90" style={{ top: `${(guides.y / H) * 100}%` }} />}

      {layer && (
        <div
          className={cn('absolute rounded-md border-2 border-accent bg-accent/5', dragging ? 'cursor-grabbing' : 'cursor-move')}
          style={box(layer.rect)}
          onPointerDown={(e) => start(e, layer, 'move')}
          data-testid="layer-box"
        >
          <span className="pointer-events-none absolute -top-6 left-0 whitespace-nowrap rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {layer.label} · {Math.round(layer.rect.x)}, {Math.round(layer.rect.y)} · {Math.round(layer.rect.w)}×{Math.round(layer.rect.h)}
          </span>
          {handlesFor(layer.edit).map((h) => {
            const p = HANDLE_POS[h];
            return (
              <span
                key={h}
                role="presentation"
                title={layer.edit === 'text' && CORNERS.includes(h) ? 'Seret untuk mengubah ukuran font' : layer.edit === 'text' ? 'Seret untuk mengubah lebar teks' : 'Seret untuk mengubah ukuran'}
                onPointerDown={(e) => start(e, layer, h)}
                className={cn(
                  'absolute size-3 -translate-x-1/2 -translate-y-1/2 border-2 border-accent bg-white shadow',
                  layer.edit === 'text' && CORNERS.includes(h) ? 'rounded-full' : 'rounded-[3px]',
                )}
                style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, cursor: p.cursor }}
              />
            );
          })}
        </div>
      )}
    </>
  );
}
