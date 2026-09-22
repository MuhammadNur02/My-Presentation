import {
  CanvasTexture,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  Object3D,
  PlaneGeometry,
  ShaderMaterial,
  Vector2,
  Vector4,
} from 'three';
import type { TextSplit } from '../../types';
import type { SlideLayer } from '../layers';
import type { Rect } from '../sharedElements';
import { ParticleField } from './particles';
import { CARD_FRAGMENT, CARD_VERTEX, FLAT_FRAGMENT, FLAT_VERTEX } from './shaders';

/** Dunia Three: bidang slide 16×9 ↔ ruang logis 1920×1080. */
export const UNIT = 16 / 1920;
const HALF_W = 8;
const HALF_H = 4.5;

export interface ScenePart {
  mesh: Mesh;
  /** Objek yang dianimasikan (posisi/skala/rotasi). Untuk potongan kata/baris = grup pembungkus, agar
   *  skala animasi tidak menimpa skala ukuran mesh. */
  holder: Object3D;
  mat: ShaderMaterial;
  /** Posisi dasar relatif terhadap `outer` (potongan kata/baris; blok = 0,0). */
  base: { x: number; y: number };
  /** Kotak klip dunia (untuk animasi 'rise'): [xMin, xMax, yMin, yMax]. */
  clip: [number, number, number, number];
  /** Tinggi bagian dalam unit dunia. */
  height: number;
}

export interface SceneNode {
  layer: SlideLayer;
  /** Posisi pusat rect — dipakai gerak ambient. */
  outer: Group;
  /** Pose animasi masuk (mode blok). */
  inner: Group;
  parts: ScenePart[];
  /** Mode pemecahan yang benar-benar dibangun ('block' bila tak ada potongan). */
  split: TextSplit;
  texture: CanvasTexture;
  baseX: number;
  baseY: number;
}

/**
 * Adegan sebuah slide: satu mesh per lapisan. Dibangun dari `SlideLayer[]` (lihat slideRenderer).
 * Semua animasi digerakkan GPU (transform + uniform) sehingga tidak ada penggambaran ulang kanvas.
 */
export class SceneView {
  readonly root = new Group();
  readonly particles = new ParticleField();
  nodes: SceneNode[] = [];
  private geometry = new PlaneGeometry(1, 1);
  private textures: CanvasTexture[] = [];
  private materials: ShaderMaterial[] = [];

  /** Material dummy untuk mengompilasi shader adegan di muka (hindari tersendat saat slide pertama tampil). */
  static warmup(): { meshes: Mesh[]; dispose: () => void } {
    const view = new SceneView();
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 2;
    const tex = new CanvasTexture(canvas);
    const dummy = {
      id: 'warm',
      role: 'title',
      motionRole: null,
      order: -1,
      mode: 'flat',
      rect: { x: 0, y: 0, w: 10, h: 10 },
      pad: 0,
      radius: 0,
      shadow: 1,
      border: false,
      tag: '',
      contentKey: '',
      paint: () => undefined,
    } as SlideLayer;
    const flat = view.blockPart(dummy, tex, 0, 0, 0);
    const card = view.cardPart({ ...dummy, mode: 'card' }, tex, 0, 0, 1);
    return {
      meshes: [flat.mesh, card.mesh],
      dispose: () => {
        tex.dispose();
        view.dispose();
      },
    };
  }

  /**
   * Bangun ulang seluruh adegan. `k` = piksel tekstur per px logis; `splitFor` menentukan apakah
   * lapisan teks dipecah menjadi potongan kata/baris.
   */
  build(layers: SlideLayer[], k: number, splitFor: (l: SlideLayer) => TextSplit): void {
    this.clear();
    layers.forEach((layer, i) => {
      const tex = this.paintTexture(layer, k);
      this.textures.push(tex);
      const cx = (layer.rect.x + layer.rect.w / 2 - 960) * UNIT;
      const cy = (540 - (layer.rect.y + layer.rect.h / 2)) * UNIT;

      const outer = new Group();
      outer.position.set(cx, cy, 0);
      const inner = new Group();
      outer.add(inner);

      const wantSplit = layer.mode === 'flat' ? splitFor(layer) : 'block';
      const pieces = wantSplit === 'words' ? layer.pieces : wantSplit === 'lines' ? layer.lines : undefined;
      const parts: ScenePart[] = [];

      if (layer.mode === 'card') {
        parts.push(this.cardPart(layer, tex, cx, cy, i));
        inner.add(parts[0].mesh);
      } else if (pieces && pieces.length > 1) {
        for (const pr of pieces) parts.push(this.piecePart(layer, tex, pr, cx, cy, i));
        parts.forEach((p) => inner.add(p.holder));
      } else {
        parts.push(this.blockPart(layer, tex, cx, cy, i));
        inner.add(parts[0].mesh);
      }
      this.root.add(outer);
      this.nodes.push({
        layer,
        outer,
        inner,
        parts,
        split: parts.length > 1 ? wantSplit : 'block',
        texture: tex,
        baseX: cx,
        baseY: cy,
      });
    });
  }

  /** Pasang/copot partikel cahaya (di atas latar & cahaya, di bawah semua konten). Panggil setelah `build`. */
  setParticles(on: boolean, colorA: string, colorB: string, dark: boolean, order: number): void {
    if (!on) return;
    this.particles.configure(colorA, colorB, dark, order);
    this.root.add(this.particles.mesh);
  }

  /**
   * Lukis ulang tekstur lapisan bergerak (GIF/video/animasi) dari isi terkini sumbernya — memakai kanvas & tekstur yang
   * sama (tanpa alokasi baru), lalu tandai untuk diunggah ke GPU.
   */
  repaint(node: SceneNode): void {
    const canvas = node.texture.image as HTMLCanvasElement;
    const { layer } = node;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(canvas.width / layer.rect.w, 0, 0, canvas.height / layer.rect.h, 0, 0);
    ctx.textBaseline = 'top';
    layer.paint(ctx, layer.rect.w, layer.rect.h);
    node.texture.needsUpdate = true;
  }

  /* ------------------------------ tekstur ------------------------------ */

  private paintTexture(layer: SlideLayer, k: number): CanvasTexture {
    const pad = layer.mode === 'card' ? 0 : layer.pad;
    const lw = layer.rect.w + pad * 2;
    const lh = layer.rect.h + pad * 2;
    const cap = layer.maxTex ?? 2560;
    const s = Math.max(0.05, Math.min(k, cap / Math.max(lw, lh)));
    const cw = Math.max(2, Math.ceil(lw * s));
    const ch = Math.max(2, Math.ceil(lh * s));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(cw / lw, 0, 0, ch / lh, 0, 0);
    ctx.translate(pad, pad);
    ctx.textBaseline = 'top';
    layer.paint(ctx, layer.rect.w, layer.rect.h);
    const tex = new CanvasTexture(canvas);
    tex.generateMipmaps = true;
    tex.minFilter = LinearMipmapLinearFilter;
    tex.magFilter = LinearFilter;
    tex.anisotropy = 4;
    return tex;
  }

  /* ------------------------------- mesh -------------------------------- */

  private flatUniforms(tex: CanvasTexture, uv: [number, number, number, number]) {
    return {
      uMap: { value: tex },
      uUvRect: { value: new Vector4(...uv) },
      uOpacity: { value: 1 },
      uReveal: { value: 1 },
      uRevealDir: { value: new Vector2(1, 0) },
      uBlur: { value: 0 },
      uClip: { value: new Vector4(-HALF_W, HALF_W, -HALF_H, HALF_H) },
      uClipOn: { value: 0 },
    };
  }

  private makeMesh(mat: ShaderMaterial, order: number): Mesh {
    const mesh = new Mesh(this.geometry, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = order;
    this.materials.push(mat);
    return mesh;
  }

  private blockPart(layer: SlideLayer, tex: CanvasTexture, cx: number, cy: number, order: number): ScenePart {
    const glow = layer.role === 'glow';
    const uniforms = this.flatUniforms(tex, [0, 0, 1, 1]);
    if (glow) uniforms.uClipOn.value = 1; // cahaya tak boleh tumpah ke area letterbox
    const mat = new ShaderMaterial({
      uniforms,
      vertexShader: FLAT_VERTEX,
      fragmentShader: FLAT_FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = this.makeMesh(mat, order);
    const w = (layer.rect.w + layer.pad * 2) * UNIT;
    const h = (layer.rect.h + layer.pad * 2) * UNIT;
    mesh.scale.set(w, h, 1);
    const pw = layer.rect.w * UNIT;
    const ph = layer.rect.h * UNIT;
    return {
      mesh,
      holder: mesh,
      mat,
      base: { x: 0, y: 0 },
      clip: [cx - pw / 2 - 0.05, cx + pw / 2 + 0.05, cy - ph / 2 - 0.05, cy + ph / 2 + 0.05],
      height: ph,
    };
  }

  /** Potongan (kata/baris): satu mesh per potongan, berbagi satu tekstur lewat jendela UV. */
  private piecePart(layer: SlideLayer, tex: CanvasTexture, pr: Rect, cx: number, cy: number, order: number): ScenePart {
    const m = 6;
    const lw = layer.rect.w + layer.pad * 2;
    const lh = layer.rect.h + layer.pad * 2;
    const u0 = (pr.x - m + layer.pad) / lw;
    const uw = (pr.w + m * 2) / lw;
    const v0 = 1 - (pr.y + pr.h + m + layer.pad) / lh;
    const vh = (pr.h + m * 2) / lh;
    const mat = new ShaderMaterial({
      uniforms: this.flatUniforms(tex, [u0, v0, uw, vh]),
      vertexShader: FLAT_VERTEX,
      fragmentShader: FLAT_FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = this.makeMesh(mat, order);
    mesh.scale.set((pr.w + m * 2) * UNIT, (pr.h + m * 2) * UNIT, 1);
    const bx = (pr.x + pr.w / 2 - layer.rect.w / 2) * UNIT;
    const by = -(pr.y + pr.h / 2 - layer.rect.h / 2) * UNIT;
    const holder = new Group();
    holder.position.set(bx, by, 0);
    holder.add(mesh);
    const hw = (pr.w / 2 + m) * UNIT;
    const hh = (pr.h / 2) * UNIT;
    return {
      mesh,
      holder,
      mat,
      base: { x: bx, y: by },
      clip: [cx + bx - hw, cx + bx + hw, cy + by - hh - 0.04, cy + by + hh + 0.04],
      height: pr.h * UNIT,
    };
  }

  private cardPart(layer: SlideLayer, tex: CanvasTexture, cx: number, cy: number, order: number): ScenePart {
    const margin = layer.shadow > 0 ? 100 : 6;
    const mat = new ShaderMaterial({
      uniforms: {
        uMap: { value: tex },
        uSize: { value: new Vector2(layer.rect.w, layer.rect.h) },
        uMargin: { value: margin },
        uRadius: { value: layer.radius },
        uShadow: { value: layer.shadow },
        uBorder: { value: layer.border ? 1 : 0 },
        uAspect: { value: layer.rect.w / Math.max(1, layer.rect.h) },
        uZoom: { value: 1 },
        uPan: { value: new Vector2(0, 0) },
        uOpacity: { value: 1 },
        uReveal: { value: 1 },
        uRevealDir: { value: new Vector2(1, 0) },
        uBlur: { value: 0 },
        uClip: { value: new Vector4(-HALF_W, HALF_W, -HALF_H, HALF_H) },
        uClipOn: { value: 0 },
      },
      vertexShader: CARD_VERTEX,
      fragmentShader: CARD_FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const mesh = this.makeMesh(mat, order);
    mesh.scale.set((layer.rect.w + margin * 2) * UNIT, (layer.rect.h + margin * 2) * UNIT, 1);
    const pw = layer.rect.w * UNIT;
    const ph = layer.rect.h * UNIT;
    return {
      mesh,
      holder: mesh,
      mat,
      base: { x: 0, y: 0 },
      clip: [cx - pw / 2 - 0.1, cx + pw / 2 + 0.1, cy - ph / 2 - 0.1, cy + ph / 2 + 0.1],
      height: ph,
    };
  }

  /* ------------------------------ siklus ------------------------------- */

  clear(): void {
    this.root.clear();
    this.textures.forEach((t) => {
      const img = t.image as HTMLCanvasElement | undefined;
      t.dispose();
      if (img) {
        img.width = 1;
        img.height = 1;
      }
    });
    this.materials.forEach((m) => m.dispose());
    this.textures = [];
    this.materials = [];
    this.nodes = [];
  }

  dispose(): void {
    this.clear();
    this.particles.dispose();
    this.geometry.dispose();
  }
}
