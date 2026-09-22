import {
  CanvasTexture,
  LinearFilter,
  Mesh,
  ShaderMaterial,
  Vector2,
  Vector4,
  type BufferGeometry,
  type Scene,
} from 'three';
import type { SharedElement, SharedPair } from './sharedElements';
import { MORPH_FRAGMENT, MORPH_VERTEX } from './transitions/morphShader';

interface Slot {
  mesh: Mesh;
  mat: ShaderMaterial;
  texA: CanvasTexture | null;
  texB: CanvasTexture | null;
  sameContent: boolean;
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Rasterisasi satu elemen bersama ke tekstur mandiri (resolusi mengikuti skala tekstur slide). */
function elementTexture(el: SharedElement, k: number): CanvasTexture {
  const s = Math.min(k, 2560 / el.rect.w, 2560 / el.rect.h);
  const w = Math.max(8, Math.round(el.rect.w * s));
  const h = Math.max(8, Math.round(el.rect.h * s));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(w / el.rect.w, 0, 0, h / el.rect.h, 0, 0);
  ctx.textBaseline = 'top';
  el.paint(ctx, el.rect.w, el.rect.h);
  const tex = new CanvasTexture(canvas);
  tex.generateMipmaps = false;
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  return tex;
}

function disposeTexture(t: CanvasTexture | null): void {
  if (!t) return;
  const img = t.image as HTMLCanvasElement | undefined;
  t.dispose();
  if (img) {
    img.width = 1;
    img.height = 1;
  }
}

/**
 * Magic Move — mengelola quad-quad elemen bersama yang diterbangkan selama transisi.
 * Setiap pasangan (elemen asal → elemen tujuan) = satu mesh berisi shader morph
 * (posisi, ukuran, radius sudut, bayangan, dan peleburan isi berubah kontinu).
 */
export class MagicMove {
  private slots: Slot[] = [];
  private active = 0;

  constructor(scene: Scene, geometry: BufferGeometry, maxPairs = 2) {
    for (let i = 0; i < maxPairs; i++) {
      const mat = new ShaderMaterial({
        uniforms: {
          uTexA: { value: null },
          uTexB: { value: null },
          uRectA: { value: new Vector4() },
          uRectB: { value: new Vector4() },
          uRad: { value: new Vector2() },
          uShadow: { value: new Vector2() },
          uAspect: { value: new Vector2(1, 1) },
          uP: { value: 0 },
          uMixT: { value: 0 },
          uPop: { value: 0.05 },
        },
        vertexShader: MORPH_VERTEX,
        fragmentShader: MORPH_FRAGMENT,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });
      const mesh = new Mesh(geometry, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 10 + i; // di atas kedua layer dasar
      scene.add(mesh);
      this.slots.push({ mesh, mat, texA: null, texB: null, sameContent: true });
    }
  }

  /** Material untuk pemanasan (kompilasi shader di muka). */
  get warmupMaterial(): ShaderMaterial {
    return this.slots[0].mat;
  }

  /** Jumlah pasangan yang sedang beranimasi. */
  get count(): number {
    return this.active;
  }

  /** Mulai: buat tekstur elemen dan pasang uniform. `k` = skala tekstur (px tekstur per px logis). */
  begin(pairs: SharedPair[], k: number): void {
    this.end();
    pairs.slice(0, this.slots.length).forEach((pair, i) => {
      const slot = this.slots[i];
      const { from, to } = pair;
      slot.sameContent = pair.sameContent;
      slot.texA = elementTexture(from, k);
      slot.texB = pair.sameContent ? slot.texA : elementTexture(to, k);
      const u = slot.mat.uniforms;
      u.uTexA.value = slot.texA;
      u.uTexB.value = slot.texB;
      (u.uRectA.value as Vector4).set(from.rect.x, from.rect.y, from.rect.w, from.rect.h);
      (u.uRectB.value as Vector4).set(to.rect.x, to.rect.y, to.rect.w, to.rect.h);
      (u.uRad.value as Vector2).set(from.radius, to.radius);
      (u.uShadow.value as Vector2).set(from.shadow, to.shadow);
      (u.uAspect.value as Vector2).set(from.rect.w / from.rect.h, to.rect.w / to.rect.h);
      u.uP.value = 0;
      u.uMixT.value = 0;
      slot.mesh.visible = true;
      this.active = i + 1;
    });
  }

  /** Perbarui progres (sudah ter-ease). Isi melebur di tengah perjalanan agar gerak terbaca dulu. */
  update(p: number): void {
    for (let i = 0; i < this.active; i++) {
      const slot = this.slots[i];
      slot.mat.uniforms.uP.value = p;
      // Isi melebur saat elemen sedang mekar (bukan saat baru mulai bergeser).
      slot.mat.uniforms.uMixT.value = slot.sameContent ? 0 : smooth(0.34, 0.92, p);
    }
  }

  /** Selesai: sembunyikan dan bebaskan tekstur elemen. */
  end(): void {
    for (const slot of this.slots) {
      slot.mesh.visible = false;
      if (slot.texB !== slot.texA) disposeTexture(slot.texB);
      disposeTexture(slot.texA);
      slot.texA = null;
      slot.texB = null;
      slot.mat.uniforms.uTexA.value = null;
      slot.mat.uniforms.uTexB.value = null;
    }
    this.active = 0;
  }

  dispose(): void {
    this.end();
    for (const slot of this.slots) slot.mat.dispose();
    this.slots = [];
  }
}
