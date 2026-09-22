import { gsap } from 'gsap';
import type { Object3D, Vector2 } from 'three';
import type { BuildAnimation, Slide } from '../../types';
import type { SlideLayer } from '../layers';
import { ambientOf, isTextRole, resolveMotion, type ResolvedMotion } from '../motion';
import type { SceneNode, SceneView } from './SceneView';

/**
 * Pemutar gerak jalur adegan.
 *  - playEnter  : animasi masuk per elemen (GSAP, di GPU: transform + uniform), teks bisa per kata/baris.
 *  - applyAmbient: gerak ambient sebagai FUNGSI WAKTU (Ken Burns, melayang, denyut, aurora) — tanpa timeline
 *    sehingga tetap kontinu walau adegan dibangun ulang saat pengguna mengedit.
 */

// Satuan dunia: 1 unit = 120 px logis.
const UP = 0.38; // 46 px
const SIDE = 0.92; // 110 px
const DROP = 1.08; // 130 px

interface Target {
  obj: Object3D;
  base: { x: number; y: number };
  mats: { uniforms: Record<string, { value: unknown }> }[];
  clip: [number, number, number, number];
  height: number;
}

function fadeIn(tl: gsap.core.Timeline, t: Target, dur: number, at: number, ease = 'power2.out', frac = 0.8): void {
  for (const m of t.mats) tl.fromTo(m.uniforms.uOpacity, { value: 0 }, { value: 1, duration: dur * frac, ease }, at);
}

function enterOne(tl: gsap.core.Timeline, t: Target, enter: BuildAnimation, dur: number, at: number): void {
  const { obj, base } = t;
  switch (enter) {
    case 'fade':
      fadeIn(tl, t, dur, at, 'power1.out', 1);
      break;
    case 'fade-up':
      tl.fromTo(obj.position, { y: base.y - UP }, { y: base.y, duration: dur, ease: 'power3.out' }, at);
      fadeIn(tl, t, dur, at);
      break;
    case 'slide-left':
      tl.fromTo(obj.position, { x: base.x - SIDE }, { x: base.x, duration: dur, ease: 'power3.out' }, at);
      fadeIn(tl, t, dur, at);
      break;
    case 'slide-right':
      tl.fromTo(obj.position, { x: base.x + SIDE }, { x: base.x, duration: dur, ease: 'power3.out' }, at);
      fadeIn(tl, t, dur, at);
      break;
    case 'drop':
      tl.fromTo(obj.position, { y: base.y + DROP }, { y: base.y, duration: dur * 1.1, ease: 'back.out(1.5)' }, at);
      fadeIn(tl, t, dur, at, 'power1.out', 0.4);
      break;
    case 'scale':
      tl.fromTo(obj.scale, { x: 0.9, y: 0.9 }, { x: 1, y: 1, duration: dur, ease: 'power3.out' }, at);
      fadeIn(tl, t, dur, at);
      break;
    case 'zoom-out':
      tl.fromTo(obj.scale, { x: 1.25, y: 1.25 }, { x: 1, y: 1, duration: dur, ease: 'power3.out' }, at);
      fadeIn(tl, t, dur, at);
      break;
    case 'bounce':
      tl.fromTo(obj.scale, { x: 0.55, y: 0.55 }, { x: 1, y: 1, duration: dur, ease: 'back.out(2.4)' }, at);
      fadeIn(tl, t, dur, at, 'power1.out', 0.35);
      break;
    case 'rotate-in':
      tl.fromTo(obj.rotation, { z: -0.22 }, { z: 0, duration: dur, ease: 'power3.out' }, at);
      tl.fromTo(obj.scale, { x: 0.88, y: 0.88 }, { x: 1, y: 1, duration: dur, ease: 'power3.out' }, at);
      fadeIn(tl, t, dur, at);
      break;
    case 'flip-in':
      tl.fromTo(obj.rotation, { y: -1.45 }, { y: 0, duration: dur, ease: 'power3.out' }, at);
      fadeIn(tl, t, dur, at, 'power1.out', 0.45);
      break;
    case 'wipe':
      for (const m of t.mats) {
        (m.uniforms.uRevealDir.value as Vector2).set(1, 0);
        tl.fromTo(m.uniforms.uReveal, { value: 0 }, { value: 1, duration: dur, ease: 'power2.inOut' }, at);
      }
      break;
    case 'blur-in':
      for (const m of t.mats) tl.fromTo(m.uniforms.uBlur, { value: 2.6 }, { value: 0, duration: dur, ease: 'power2.out' }, at);
      fadeIn(tl, t, dur, at, 'power2.out', 0.7);
      break;
    case 'rise': {
      // Teks naik dari bawah garis baseline-nya: klip ke kotak akhir supaya tampak "keluar dari celah".
      const c = t.clip;
      for (const m of t.mats) {
        const u = m.uniforms as Record<string, { value: unknown }>;
        (u.uClip.value as { set: (...a: number[]) => void }).set(c[0], c[1], c[2], c[3]);
        u.uClipOn.value = 1;
        tl.set(u.uClipOn, { value: 0 }, at + dur + 0.02);
      }
      tl.fromTo(obj.position, { y: base.y - t.height * 1.05 }, { y: base.y, duration: dur, ease: 'power3.out' }, at);
      fadeIn(tl, t, dur, at, 'power1.out', 0.3);
      break;
    }
    case 'zoom-in':
      tl.fromTo(obj.scale, { x: 0.7, y: 0.7 }, { x: 1, y: 1, duration: dur, ease: 'expo.out' }, at);
      fadeIn(tl, t, dur, at, 'power2.out', 0.6);
      break;
    case 'elastic':
      tl.fromTo(obj.scale, { x: 0.25, y: 0.25 }, { x: 1, y: 1, duration: dur * 1.3, ease: 'elastic.out(1, 0.5)' }, at);
      fadeIn(tl, t, dur, at, 'power1.out', 0.25);
      break;
    case 'flip-x':
      tl.fromTo(obj.rotation, { x: -1.4 }, { x: 0, duration: dur, ease: 'power3.out' }, at);
      fadeIn(tl, t, dur, at, 'power1.out', 0.45);
      break;
    case 'tilt-up':
      tl.fromTo(obj.position, { y: base.y - UP * 1.5 }, { y: base.y, duration: dur, ease: 'power3.out' }, at);
      tl.fromTo(obj.rotation, { x: 0.8 }, { x: 0, duration: dur, ease: 'power3.out' }, at);
      fadeIn(tl, t, dur, at);
      break;
    case 'spiral':
      tl.fromTo(obj.rotation, { z: 1.7 }, { z: 0, duration: dur * 1.1, ease: 'power3.out' }, at);
      tl.fromTo(obj.scale, { x: 0.15, y: 0.15 }, { x: 1, y: 1, duration: dur * 1.1, ease: 'power3.out' }, at);
      fadeIn(tl, t, dur, at, 'power1.out', 0.5);
      break;
    case 'wipe-down':
    case 'wipe-up':
      for (const m of t.mats) {
        (m.uniforms.uRevealDir.value as Vector2).set(0, enter === 'wipe-down' ? -1 : 1);
        tl.fromTo(m.uniforms.uReveal, { value: 0 }, { value: 1, duration: dur, ease: 'power2.inOut' }, at);
      }
      break;
    case 'typewriter':
      // Sapuan bertahap seperti mengetik; pada mode per baris tiap baris diketik bergiliran (lihat playEnter).
      for (const m of t.mats) {
        (m.uniforms.uRevealDir.value as Vector2).set(1, 0);
        tl.fromTo(m.uniforms.uReveal, { value: 0 }, { value: 1, duration: dur, ease: 'steps(16)' }, at);
      }
      break;
    case 'glitch-in':
      tl.fromTo(obj.position, { x: base.x + 0.34 }, { x: base.x, duration: dur * 0.7, ease: 'steps(7)' }, at);
      for (const m of t.mats) {
        tl.fromTo(m.uniforms.uOpacity, { value: 0 }, { value: 1, duration: dur * 0.7, ease: 'steps(7)' }, at);
        tl.fromTo(m.uniforms.uBlur, { value: 1.8 }, { value: 0, duration: dur * 0.7, ease: 'steps(5)' }, at);
      }
      break;
    default:
      break;
  }
}

function targetsOf(node: SceneNode): Target[] {
  if (node.parts.length > 1) {
    return node.parts.map((p) => ({ obj: p.holder, base: p.base, mats: [p.mat], clip: p.clip, height: p.height }));
  }
  const p = node.parts[0];
  return [{ obj: node.inner, base: { x: 0, y: 0 }, mats: [p.mat], clip: p.clip, height: p.height }];
}

/** Putar animasi masuk satu node pada waktu `start` (detik, relatif ke timeline). Dipakai `playEnter` & `playEnterStep`. */
function playNode(tl: gsap.core.Timeline, node: SceneNode, m: ResolvedMotion, reduced: boolean, start: number): void {
  const role = node.layer.motionRole;
  if (!role || m.enter === 'none') return;
  const textual = isTextRole(role) && node.layer.role !== 'decor';
  const enter: BuildAnimation = reduced
    ? 'fade'
    : m.enter === 'rise' && !textual
      ? 'fade-up'
      : m.enter === 'typewriter' && !textual
        ? 'wipe'
        : m.enter;
  const dur = reduced ? 0.3 : m.duration;
  const targets = targetsOf(node);
  // Mengetik: baris diketik bergiliran (satu baris selesai dulu, lalu baris berikutnya).
  const typing = enter === 'typewriter' && targets.length > 1;
  targets.forEach((t, i) => {
    if (typing) enterOne(tl, t, enter, dur * 0.8, start + i * dur * 0.8);
    else enterOne(tl, t, enter, dur, start + (targets.length > 1 ? i * m.stagger : 0));
  });
}

/**
 * Putar animasi masuk untuk elemen yang lolos `match`. Elemen disembunyikan seketika (fromTo langsung
 * dirender) lalu masuk sesuai jeda/urutan; elemen yang tak lolos `match` dibiarkan apa adanya.
 */
export function playEnter(
  view: SceneView,
  slide: Slide,
  match: (layer: SlideLayer) => boolean,
  baseDelay: number,
  reduced: boolean,
): gsap.core.Timeline {
  const tl = gsap.timeline();
  for (const node of view.nodes) {
    const role = node.layer.motionRole;
    if (!role || !match(node.layer)) continue;
    const m = resolveMotion(slide, role, node.layer.order);
    const item = role === 'body' ? Math.max(0, node.layer.order - 3) * m.itemStagger : 0;
    playNode(tl, node, m, reduced, baseDelay + m.delay + item);
  }
  return tl;
}

/**
 * Reveal bertahap: putar animasi masuk HANYA untuk elemen body pada `order` tertentu — dipakai saat
 * presenter menekan lanjut/mundur untuk mengungkap satu poin/kartu, terpisah dari elemen slide lain.
 */
export function playEnterStep(view: SceneView, slide: Slide, order: number, reduced: boolean): gsap.core.Timeline {
  const tl = gsap.timeline();
  for (const node of view.nodes) {
    if (node.layer.motionRole !== 'body' || node.layer.order !== order) continue;
    const m = resolveMotion(slide, 'body', order);
    if (m.enter === 'none') {
      // "Tanpa animasi" + reveal bertahap tetap harus MUNCUL saat diklik, hanya tanpa animasi.
      for (const p of node.parts) p.mat.uniforms.uOpacity.value = 1;
      continue;
    }
    playNode(tl, node, m, reduced, 0);
  }
  return tl;
}

/** Sembunyikan (tanpa animasi) elemen body dengan order di dalam `orders` — dipakai reveal bertahap sebelum diklik. */
export function hideBodyOrders(view: SceneView, orders: ReadonlySet<number>): void {
  for (const node of view.nodes) {
    if (node.layer.motionRole !== 'body' || !orders.has(node.layer.order)) continue;
    node.inner.position.set(0, 0, 0);
    node.inner.scale.set(1, 1, 1);
    node.inner.rotation.set(0, 0, 0);
    for (const p of node.parts) {
      p.holder.position.set(p.base.x, p.base.y, 0);
      if (p.holder !== p.mesh) {
        p.holder.scale.set(1, 1, 1);
        p.holder.rotation.set(0, 0, 0);
      }
      const u = p.mat.uniforms;
      u.uOpacity.value = 0;
      u.uReveal.value = 1;
      u.uBlur.value = 0;
      u.uClipOn.value = 0;
    }
  }
}

/** Kembalikan semua pose/uniform animasi masuk ke keadaan akhir (dipakai saat timeline dihentikan paksa). */
export function settleEnter(view: SceneView): void {
  for (const node of view.nodes) {
    node.inner.position.set(0, 0, 0);
    node.inner.scale.set(1, 1, 1);
    node.inner.rotation.set(0, 0, 0);
    for (const p of node.parts) {
      p.holder.position.set(p.base.x, p.base.y, 0);
      if (p.holder !== p.mesh) {
        p.holder.scale.set(1, 1, 1);
        p.holder.rotation.set(0, 0, 0);
      }
      const u = p.mat.uniforms;
      u.uOpacity.value = 1;
      u.uReveal.value = 1;
      u.uBlur.value = 0;
      if (node.layer.role !== 'glow') u.uClipOn.value = 0;
    }
  }
}

const TAU = Math.PI * 2;

/**
 * Gerak ambient pada waktu `t` (detik). Mengembalikan true bila ada gerak aktif
 * (pemanggil perlu terus merender).
 */
export function applyAmbient(view: SceneView, slide: Slide, t: number): boolean {
  const a = ambientOf(slide);
  let glowIdx = 0;
  for (const node of view.nodes) {
    const { layer } = node;
    if (layer.role === 'glow') {
      const i = glowIdx++;
      if (a.aurora) {
        const ph = i * 2.1;
        node.outer.position.set(
          node.baseX + Math.sin((t / 19) * TAU + ph) * 0.85,
          node.baseY + Math.cos((t / 23) * TAU + ph * 1.3) * 0.5,
          0,
        );
        const s = 1 + Math.sin((t / 17) * TAU + ph) * 0.09;
        node.outer.scale.set(s, s, 1);
      } else {
        node.outer.position.set(node.baseX, node.baseY, 0);
        node.outer.scale.set(1, 1, 1);
      }
      continue;
    }
    if (layer.role === 'media' && layer.mode === 'card') {
      const u = node.parts[0].mat.uniforms;
      let zoom = 1;
      let px = 0;
      let py = 0;
      let ox = 0;
      let oy = 0;
      let sc = 1;
      let rx = 0;
      let ry = 0;
      let rz = 0;
      switch (a.media) {
        case 'kenburns':
          zoom = 1 + 0.045 * (1 - Math.cos((t / 16) * TAU));
          px = Math.sin((t / 23) * TAU) * 0.011;
          py = Math.cos((t / 19) * TAU) * 0.008;
          break;
        case 'drift':
          // Zoom tetap + geser lambat melintasi foto (seperti kamera panning).
          zoom = 1.08;
          px = Math.sin((t / 17) * TAU) * 0.03;
          py = Math.cos((t / 23) * TAU) * 0.02;
          break;
        case 'float':
          oy = Math.sin((t / 4.2) * TAU) * 0.055;
          break;
        case 'pulse':
          sc = 1 + Math.sin((t / 3.2) * TAU) * 0.03;
          break;
        case 'sway':
          rz = Math.sin((t / 7) * TAU) * 0.02;
          oy = Math.sin((t / 5) * TAU) * 0.03;
          break;
        case 'tilt3d':
          // Kartu mengayun 3D perlahan (perspektif kamera membuatnya tampak berputar di ruang).
          ry = Math.sin((t / 9) * TAU) * 0.12;
          rx = Math.cos((t / 12) * TAU) * 0.07;
          sc = 1.015;
          break;
        default:
          break;
      }
      u.uZoom.value = zoom;
      (u.uPan.value as { set: (x: number, y: number) => void }).set(px, py);
      node.outer.position.set(node.baseX + ox, node.baseY + oy, 0);
      node.outer.scale.set(sc, sc, 1);
      node.outer.rotation.set(rx, ry, rz);
    } else if (layer.id === 'badge' && a.media !== 'none') {
      // Lencana logo "bernapas" pelan saat gerak ambient aktif.
      const s = 1 + Math.sin((t / 3.4) * TAU) * 0.025;
      node.outer.scale.set(s, s, 1);
    }
  }
  if (a.particles) view.particles.update(t);
  return a.media !== 'none' || a.aurora || a.particles;
}

