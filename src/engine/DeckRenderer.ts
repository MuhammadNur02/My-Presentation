import { gsap } from 'gsap';
import {
  BufferGeometry,
  Color,
  ColorManagement,
  DoubleSide,
  FrontSide,
  LinearFilter,
  LinearSRGBColorSpace,
  Mesh,
  MeshBasicMaterial,
  NoToneMapping,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderTarget,
  WebGLRenderer,
} from 'three';
import type { DeckData, MotionRole, QualityTier, RenderBackend, Slide, TextSplit, TransitionConfig, TransitionId } from '../types';
import { clamp } from '../utils/color';
import { ImageStore } from './imageStore';
import type { LayerInfo, SlideLayer } from './layers';
import { MagicMove } from './MagicMove';
import { hasAmbient, hasTextEntrance, isTextRole, resolveMotion } from './motion';
import { TIER_CONFIG, lowerTier, pickTexWidth, type TierConfig } from './quality';
import { SceneView } from './scene/SceneView';
import { applyAmbient, hideBodyOrders, playEnter, playEnterStep, settleEnter } from './scene/motionPlayer';
import { pairSharedElements, type SharedPair } from './sharedElements';
import { buildLayers, collectSharedElements, describeLayers, type RenderContext } from './slideRenderer';
import { SLIDE_W } from './themes';
import { TextureCache, type TexEntry } from './textureCache';
import { TRANSITIONS, fragmentFor, type TransitionDefinition } from './transitions/definitions';
import { buildFragmentShader, buildVertexShader } from './transitions/shaderTemplates';
import { buildTileGeometry } from './transitions/tileGeometry';
import type { DeckRendererOptions, IDeckRenderer, TransitionOptions } from './types';

// Pipeline warna "mentah": tekstur kanvas 2D (sRGB) ditulis apa adanya ke framebuffer,
// sehingga piksel slide identik dengan pratinjau 2D dan tidak ada konversi ganda.
ColorManagement.enabled = false;

/** Ruang dunia: bidang slide 16×9, kamera perspektif memandang tepat sebesar layar. */
const PLANE_W = 16;
const PLANE_H = 9;
const BASE_FOV = 40;
const CAM_Z = PLANE_H / 2 / Math.tan((BASE_FOV / 2) * (Math.PI / 180));

const now = (): number => performance.now();

const ALL_ROLES: ReadonlySet<MotionRole> = new Set(['title', 'subtitle', 'body', 'media', 'logo']);
const TEXT_ROLES: ReadonlySet<MotionRole> = new Set(['title', 'subtitle', 'body']);

interface ActiveTransition {
  def: TransitionDefinition;
  cfg: TransitionConfig;
  from: number;
  to: number;
  dir: 1 | -1;
  /** Sumber datar slide asal (null bila memakai tangkapan adegan `fromRt`). */
  fromEntry: TexEntry | null;
  toEntry: TexEntry;
  /** Tangkapan frame adegan saat transisi dimulai (mempertahankan gerak ambient/animasi yang sedang berjalan). */
  fromRt: WebGLRenderTarget | null;
  timeline: gsap.core.Timeline | null;
  scrubbing: boolean;
  /** Slide tujuan punya animasi masuk teks yang dimainkan SETELAH mendarat. */
  buildPending: boolean;
  resolve: (() => void) | null;
  /** Elemen yang dilepas dari layer dasar (tag Magic Move dan/atau "@text"). */
  fromOmit: string[];
  toOmit: string[];
  magic: boolean;
}

interface ViewSig {
  slide: object;
  theme: object;
  imgVersion: number;
  logoId: string | null;
  index: number;
  total: number;
  texW: number;
}

export class DeckRenderer implements IDeckRenderer {
  readonly backend: RenderBackend;

  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(BASE_FOV, 16 / 9, 0.1, 200);
  /** Kamera ortografis membingkai bidang slide tepat 16:9 — dipakai menangkap adegan ke render target. */
  private captureCam = new OrthographicCamera(-PLANE_W / 2, PLANE_W / 2, PLANE_H / 2, -PLANE_H / 2, 0.1, 50);
  private restMat = new MeshBasicMaterial({ toneMapped: false });
  private restMesh: Mesh;
  private outMesh: Mesh;
  private inMesh: Mesh;
  private magic: MagicMove;

  /** Adegan berlapis untuk slide diam & animasi elemen. */
  private view = new SceneView();
  private viewSig: ViewSig | null = null;
  private viewIndex = -2;
  private entranceTl: gsap.core.Timeline | null = null;
  private ambientClock = 0;
  private ambientOn = false;
  /** Slide tampil punya media bergerak (GIF/video/generatif) yang sedang diputar. */
  private liveOn = false;
  private lastSweepAt = 0;
  private lastTickAt = performance.now();
  private sceneEnabled: boolean;
  /** true = renderer ini sedang dipakai untuk presentasi sungguhan (lihat `DeckRendererOptions.presenting`). */
  private presenting: boolean;
  /** Reveal bertahap: jumlah poin/kartu (peran body) sudah terungkap pada slide `this.index`. */
  private stepRevealed = 0;
  private stepTweens = new Map<number, gsap.core.Timeline>();

  /** Uniform bersama kedua layer — cukup diperbarui sekali per frame. */
  private shared = {
    uProgress: { value: 0 },
    uDir: { value: 1 },
    uIntensity: { value: 1 },
    uTime: { value: 0 },
    uSize: { value: new Vector2(PLANE_W, PLANE_H) },
  };
  private materials = new Map<TransitionId, [ShaderMaterial, ShaderMaterial]>();
  private geometries = new Map<string, BufferGeometry>();
  private warmed = new Set<TransitionId>();
  private sceneWarmed = false;

  private images: ImageStore;
  private textures: TextureCache;
  private deck: DeckData | null = null;
  private index = 0;
  private active: ActiveTransition | null = null;

  private tier: QualityTier;
  private tierCfg: TierConfig;
  private pixelScale = 1;
  private degraded = false;
  private size = { w: 1, h: 1, dpr: 1 };

  private needsRender = true;
  private paused = false;
  private disposed = false;
  private reducedMotion: boolean;

  private lastFrameAt = 0;
  private avgFrameMs = 16.7;
  private slowFrames = 0;
  private lastStatsAt = 0;
  private prefetchHandle: number | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private opts: DeckRendererOptions,
  ) {
    this.tier = opts.tier;
    this.tierCfg = TIER_CONFIG[opts.tier];
    this.reducedMotion = !!opts.reducedMotion;
    this.presenting = !!opts.presenting;
    // `?flat` (debug): paksa jalur datar untuk membandingkan dengan jalur adegan.
    this.sceneEnabled = typeof location === 'undefined' || !new URLSearchParams(location.search).has('flat');

    this.renderer = new WebGLRenderer({
      canvas,
      antialias: this.tierCfg.antialias,
      alpha: false,
      depth: false, // semua layer diurutkan lewat renderOrder; depth buffer tak diperlukan
      stencil: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = LinearSRGBColorSpace;
    this.renderer.toneMapping = NoToneMapping;
    this.backend = this.renderer.capabilities.isWebGL2 ? 'webgl2' : 'webgl';

    this.camera.position.set(0, 0, CAM_Z);
    this.captureCam.position.set(0, 0, 10);

    const restGeo = new PlaneGeometry(PLANE_W, PLANE_H, 1, 1);
    this.geometries.set('rest', restGeo);
    this.restMesh = new Mesh(restGeo, this.restMat);
    this.outMesh = new Mesh(restGeo, this.restMat);
    this.inMesh = new Mesh(restGeo, this.restMat);
    this.outMesh.visible = false;
    this.inMesh.visible = false;
    // Vertex digeser di GPU → bounding sphere CPU tidak valid; matikan frustum culling.
    this.outMesh.frustumCulled = false;
    this.inMesh.frustumCulled = false;
    this.scene.add(this.restMesh, this.outMesh, this.inMesh, this.view.root);
    this.view.root.visible = false;
    this.magic = new MagicMove(this.scene, restGeo);

    this.images = new ImageStore(() => this.requestRender());
    // Ukuran awal sementara; disetel sesuai layar begitu resize() pertama datang.
    this.textures = new TextureCache(Math.min(this.tierCfg.texW, 1280));

    canvas.addEventListener('webglcontextlost', this.onContextLost);
    canvas.addEventListener('webglcontextrestored', this.onContextRestored);
    gsap.ticker.add(this.tick);
  }

  /* ------------------------------------------------------------------ */
  /* API publik                                                          */
  /* ------------------------------------------------------------------ */

  setData(data: DeckData): void {
    if (this.disposed) return;
    this.deck = data;
    this.renderer.setClearColor(new Color(data.theme.bg1), 1);
    this.images.sync(data.images, data.anims);
    if (this.active) this.finishActive(true, false);
    this.index = clamp(this.index, -1, Math.max(0, data.slides.length - 1));
    this.pinCurrent();
    this.requestRender();
    this.warmup([...new Set(data.slides.map((s) => s.transition.type))]);
  }

  resize(width: number, height: number, dpr: number): void {
    if (this.disposed || width < 2 || height < 2) return;
    this.size = { w: width, h: height, dpr };
    this.applySize();
  }

  show(index: number, opts: { build?: boolean } = {}): void {
    if (!this.deck || this.disposed) return;
    if (this.active) this.finishActive(true, false);
    this.index = clamp(index, -1, this.deck.slides.length - 1);
    this.mountRest(opts.build ? 'all' : 'none');
    this.pinCurrent();
    this.requestRender();
    this.schedulePrefetch();
  }

  transition(to: number, opts: TransitionOptions = {}): Promise<void> {
    const deck = this.deck;
    if (!deck || this.disposed || !deck.slides[to]) return Promise.resolve();
    if (this.active) this.finishActive(true);

    const from = opts.from ?? this.index;
    if (from === to) return Promise.resolve();
    const dir = opts.direction ?? (to >= from ? 1 : -1);
    const cfg = this.effectiveConfig(opts.config ?? this.configFor(from, to, dir));

    return new Promise<void>((resolve) => {
      const st = this.setup(from, to, dir, cfg, false);
      st.resolve = resolve;
      const state = { p: 0 };
      const tl = gsap.timeline({ onComplete: () => this.finishActive(false) });
      tl.to(
        state,
        {
          p: 1,
          duration: Math.max(0.05, cfg.duration),
          ease: cfg.easing,
          onUpdate: () => {
            this.shared.uProgress.value = state.p;
            this.shared.uTime.value = tl.time();
            this.magic.update(state.p);
            this.needsRender = true;
          },
        },
        0,
      );
      st.timeline = tl;
    });
  }

  scrub(from: number, to: number, config: TransitionConfig, progress: number, direction: 1 | -1 = 1): void {
    if (!this.deck || this.disposed || !this.deck.slides[to]) return;
    const cfg = this.effectiveConfig(config);
    const a = this.active;
    if (!a || !a.scrubbing || a.from !== from || a.to !== to || a.def.id !== cfg.type || a.dir !== direction) {
      if (a) this.finishActive(true, false);
      this.setup(from, to, direction, cfg, true);
    }
    const st = this.active!;
    st.cfg = cfg;
    const eased = gsap.parseEase(cfg.easing)(clamp(progress, 0, 1));
    this.shared.uIntensity.value = cfg.intensity;
    this.shared.uProgress.value = eased;
    this.shared.uTime.value = progress * cfg.duration;
    this.magic.update(eased);
    this.requestRender();
  }

  setPaused(paused: boolean): void {
    if (this.paused === paused) return;
    this.paused = paused;
    if (paused) {
      if (this.active) this.finishActive(true);
      this.images.sweep(Number.MAX_SAFE_INTEGER); // jeda video (tick tidak lagi berjalan untuk melakukannya)
    } else {
      this.lastTickAt = performance.now();
      this.requestRender();
    }
  }

  ready(): Promise<void> {
    return this.images.ready();
  }

  getIndex(): number {
    return this.index;
  }

  /** Lapisan beranimasi slide (untuk klik-pilih & sorotan elemen di UI). */
  getLayers(index: number): LayerInfo[] {
    const slide = this.deck?.slides[index];
    return slide ? describeLayers(slide, this.rc(index)) : [];
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    gsap.ticker.remove(this.tick);
    if (this.prefetchHandle != null) clearTimeout(this.prefetchHandle);
    this.entranceTl?.kill();
    this.entranceTl = null;
    this.clearStepTweens();
    if (this.active) {
      this.active.timeline?.kill();
      this.active.fromRt?.dispose();
      this.active.resolve?.();
      this.active = null;
    }
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.view.dispose();
    this.magic.dispose();
    this.textures.disposeAll();
    this.images.dispose();
    this.geometries.forEach((g) => g.dispose());
    this.geometries.clear();
    this.materials.forEach(([a, b]) => {
      a.dispose();
      b.dispose();
    });
    this.materials.clear();
    this.restMat.dispose();
    this.scene.clear();
    this.renderer.dispose();
    // Bebaskan konteks GPU segera (browser membatasi jumlah konteks aktif per halaman).
    this.renderer.forceContextLoss();
  }

  /* ------------------------------------------------------------------ */
  /* Adegan berlapis (slide diam + animasi elemen)                        */
  /* ------------------------------------------------------------------ */

  private rc(index: number): RenderContext {
    const deck = this.deck!;
    return {
      theme: deck.theme,
      getImage: (id) => this.images.get(id),
      isLive: (id) => this.images.isLive(id),
      logoId: deck.logoId,
      index,
      total: deck.slides.length,
    };
  }

  /** Jalur adegan dipakai untuk slide nyata (bukan layar kosong) selama tidak ada transisi. */
  private sceneOK(): boolean {
    return this.sceneEnabled && !!this.deck && this.index >= 0 && !!this.deck.slides[this.index] && !this.active;
  }

  private splitFor(slide: Slide, l: SlideLayer): TextSplit {
    if (!l.motionRole || l.role === 'decor' || !isTextRole(l.motionRole)) return 'block';
    const m = resolveMotion(slide, l.motionRole, l.order);
    // Mengetik butuh potongan baris agar tiap baris bisa diketik bergiliran.
    return m.enter === 'typewriter' && m.split === 'block' ? 'lines' : m.split;
  }

  private viewFresh(index: number): boolean {
    const deck = this.deck;
    const s = this.viewSig;
    if (!deck || !s || this.viewIndex !== index) return false;
    return (
      s.slide === deck.slides[index] &&
      s.theme === deck.theme &&
      s.imgVersion === this.images.version &&
      s.logoId === deck.logoId &&
      s.index === index &&
      s.total === deck.slides.length &&
      s.texW === this.textures.width
    );
  }

  private buildView(index: number): void {
    const deck = this.deck!;
    const slide = deck.slides[index];
    const layers = buildLayers(slide, this.rc(index));
    this.view.build(layers, this.textures.width / SLIDE_W, (l) => this.splitFor(slide, l));
    for (const node of this.view.nodes) {
      if (node.layer.live) this.images.hint(node.layer.live, node.layer.rect.w / node.layer.rect.h);
    }
    const backdrop = layers.filter((l) => l.role === 'bg' || l.role === 'glow').length;
    this.view.setParticles(!!slide.motion?.particles && this.ambientAllowed(), deck.theme.accent, deck.theme.accent2, deck.theme.mode === 'dark', backdrop - 0.5);
    this.viewIndex = index;
    this.viewSig = {
      slide,
      theme: deck.theme,
      imgVersion: this.images.version,
      logoId: deck.logoId,
      index,
      total: deck.slides.length,
      texW: this.textures.width,
    };
  }

  /**
   * Tampilkan slide `this.index` dalam keadaan diam. `animate`: 'all' = semua elemen masuk (mis. saat
   * memilih slide), 'text' = hanya teks (elemen lain sudah tampil dari tekstur datar transisi), 'none' = utuh.
   * `dir` = arah kedatangan (dipakai hanya saat presenting & slide ber-`stepReveal`): 1 = mendarat dari
   * depan → poin mulai TERSEMBUNYI, siap diungkap satu per satu; -1 = mendarat dari belakang → langsung utuh.
   */
  private mountRest(animate: 'none' | 'text' | 'all', dir: 1 | -1 = 1): void {
    this.entranceTl?.kill();
    this.entranceTl = null;
    this.setRestVisible();
    if (!this.sceneEnabled || !this.deck || this.index < 0) {
      this.needsRender = true;
      return;
    }
    const slide = this.deck.slides[this.index];
    const stepped = this.presenting && !!slide.stepReveal;
    if (animate === 'none') {
      if (!this.viewFresh(this.index)) this.viewIndex = -2; // dibangun malas saat frame berikutnya
      else {
        settleEnter(this.view);
        if (stepped) this.applyStepState(dir);
      }
    } else {
      if (!this.viewFresh(this.index)) this.buildView(this.index);
      settleEnter(this.view);
      const roleSet = animate === 'all' ? ALL_ROLES : TEXT_ROLES;
      // Reveal bertahap: poin (peran body) dikeluarkan dari animasi masuk bersama — diungkap belakangan per klik.
      const match = (l: SlideLayer): boolean => !!l.motionRole && roleSet.has(l.motionRole) && !(stepped && l.motionRole === 'body');
      const tl = playEnter(this.view, slide, match, animate === 'all' ? 0.05 : 0.02, this.reducedMotion);
      tl.eventCallback('onUpdate', () => {
        this.needsRender = true;
      });
      tl.eventCallback('onComplete', () => {
        if (this.entranceTl === tl) this.entranceTl = null;
        this.needsRender = true;
      });
      this.entranceTl = tl;
      if (stepped) this.applyStepState(dir);
    }
    this.needsRender = true;
  }

  /* -------------------------------- Reveal bertahap ------------------------------- */

  /** Order (urutan build) semua elemen body pada adegan yang sedang dibangun, urut naik. */
  private stepOrders(): number[] {
    const set = new Set<number>();
    for (const n of this.view.nodes) if (n.layer.motionRole === 'body') set.add(n.layer.order);
    return [...set].sort((a, b) => a - b);
  }

  private clearStepTweens(): void {
    for (const tl of this.stepTweens.values()) tl.kill();
    this.stepTweens.clear();
  }

  /** Status AWAL reveal bertahap saat slide baru mendarat. dir 1 = mulai dari nol; -1 = langsung penuh. */
  private applyStepState(dir: 1 | -1): void {
    this.clearStepTweens();
    const orders = this.stepOrders();
    this.stepRevealed = dir === 1 ? 0 : orders.length;
    if (this.stepRevealed < orders.length) hideBodyOrders(this.view, new Set(orders.slice(this.stepRevealed)));
  }

  /** Terapkan ULANG progres reveal bertahap SAAT INI setelah adegan dibangun ulang (tak mereset progres). */
  private reapplyStepState(): void {
    if (!this.presenting || !this.deck || this.index < 0) return;
    const slide = this.deck.slides[this.index];
    if (!slide.stepReveal) return;
    const orders = this.stepOrders();
    this.stepRevealed = Math.min(this.stepRevealed, orders.length);
    if (this.stepRevealed < orders.length) hideBodyOrders(this.view, new Set(orders.slice(this.stepRevealed)));
  }

  stepForward(): boolean {
    if (!this.presenting || this.disposed || !this.deck || this.index < 0 || !this.viewFresh(this.index)) return false;
    const slide = this.deck.slides[this.index];
    if (!slide.stepReveal) return false;
    const orders = this.stepOrders();
    if (this.stepRevealed >= orders.length) return false;
    const order = orders[this.stepRevealed++];
    this.stepTweens.get(order)?.kill();
    const tl = playEnterStep(this.view, slide, order, this.reducedMotion);
    this.stepTweens.set(order, tl);
    tl.eventCallback('onUpdate', () => {
      this.needsRender = true;
    });
    this.needsRender = true;
    return true;
  }

  stepBackward(): boolean {
    if (!this.presenting || this.disposed || !this.deck || this.index < 0 || !this.viewFresh(this.index) || this.stepRevealed <= 0) return false;
    const slide = this.deck.slides[this.index];
    if (!slide.stepReveal) return false;
    const orders = this.stepOrders();
    const order = orders[--this.stepRevealed];
    this.stepTweens.get(order)?.kill();
    this.stepTweens.delete(order);
    hideBodyOrders(this.view, new Set([order]));
    this.needsRender = true;
    return true;
  }

  stepStatus(): { done: number; total: number } {
    if (!this.presenting || !this.deck || this.index < 0) return { done: 0, total: 0 };
    const slide = this.deck.slides[this.index];
    if (!slide.stepReveal) return { done: 0, total: 0 };
    const total = this.viewFresh(this.index)
      ? this.stepOrders().length
      : buildLayers(slide, this.rc(this.index)).filter((l) => l.motionRole === 'body').length;
    return { done: Math.min(this.stepRevealed, total), total };
  }

  /** Tangkap adegan saat ini ke render target 16:9 (keadaan persis termasuk gerak yang sedang berjalan). */
  private captureScene(): WebGLRenderTarget {
    const w = this.textures.width;
    const rt = new WebGLRenderTarget(w, Math.round((w * 9) / 16), {
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
    });
    this.renderer.setRenderTarget(rt);
    this.renderer.clear();
    this.renderer.render(this.scene, this.captureCam);
    this.renderer.setRenderTarget(null);
    return rt;
  }

  /** Gerak ambient hanya bila tidak diminta gerak minimal dan perangkat tidak pada tier hemat (hemat baterai). */
  private ambientAllowed(): boolean {
    return !this.reducedMotion && this.tier !== 'low';
  }

  /** Adegan sedang tampil untuk slide `index` dan sedang bergerak (ambient / animasi masuk)? */
  private sceneMoving(index: number): boolean {
    return this.view.root.visible && this.viewIndex === index && (this.ambientOn || this.liveOn || !!this.entranceTl?.isActive());
  }

  /* ------------------------------------------------------------------ */
  /* Transisi                                                            */
  /* ------------------------------------------------------------------ */

  /** Transisi milik pasangan slide: maju → milik slide tujuan; mundur → milik slide asal. */
  private configFor(from: number, to: number, dir: 1 | -1): TransitionConfig {
    const slides = this.deck!.slides;
    return dir > 0 || !slides[from] ? slides[to].transition : slides[from].transition;
  }

  private effectiveConfig(cfg: TransitionConfig): TransitionConfig {
    if (!this.reducedMotion) return cfg;
    return { ...cfg, type: 'fade', duration: Math.min(cfg.duration, 0.45), intensity: 0.4 };
  }

  private setup(from: number, to: number, dir: 1 | -1, cfg: TransitionConfig, scrubbing: boolean): ActiveTransition {
    const deck = this.deck!;
    const def = TRANSITIONS[cfg.type];
    const [outMat, inMat] = this.materialsFor(def);
    const geo = this.geometryFor(def);
    this.outMesh.geometry = geo;
    this.inMesh.geometry = geo;
    this.outMesh.material = outMat;
    this.inMesh.material = inMat;
    const top = def.onTop(dir);
    this.outMesh.renderOrder = top === 'out' ? 1 : 0;
    this.inMesh.renderOrder = top === 'in' ? 1 : 0;

    const fromSlide = deck.slides[from] ?? null;
    const toSlide = deck.slides[to];
    // Teks slide tujuan dirangkai SETELAH mendarat: layer dasar tujuan dibuat tanpa teks.
    const buildPending = !scrubbing && hasTextEntrance(toSlide);

    // Magic Move: pasangkan elemen bersama (tag sama) lalu lepas dari layer dasar; elemen itu
    // diterbangkan terpisah oleh MagicMove sehingga tidak ada potongan keras.
    let pairs: SharedPair[] = [];
    if (def.magic) {
      const elsFrom = fromSlide ? collectSharedElements(fromSlide, this.rc(from)) : [];
      pairs = pairSharedElements(elsFrom, collectSharedElements(toSlide, this.rc(to))).slice(0, 2);
    }
    const uniq = (xs: string[]) => [...new Set(xs)];
    const fromOmit = uniq(pairs.map((p) => p.from.tag));
    const toOmit = uniq([...pairs.map((p) => p.to.tag), ...(buildPending ? ['@text'] : [])]);

    // Sumber slide asal: tangkapan adegan bila sedang bergerak (tanpa loncatan), selain itu tekstur datar.
    const fromRt = !scrubbing && pairs.length === 0 && this.sceneMoving(from) ? this.captureScene() : null;
    const fromEntry = fromRt ? null : this.textures.get(from, deck, this.images, fromOmit);
    const toEntry = this.textures.get(to, deck, this.images, toOmit);
    if (pairs.length) this.magic.begin(pairs, this.textures.width / SLIDE_W);

    this.entranceTl?.kill();
    this.entranceTl = null;

    this.shared.uIntensity.value = cfg.intensity;
    this.shared.uDir.value = dir;
    this.shared.uProgress.value = 0;
    this.shared.uTime.value = 0;

    this.view.root.visible = false;
    this.restMesh.visible = false;
    this.outMesh.visible = true;
    this.inMesh.visible = true;

    const st: ActiveTransition = {
      def,
      cfg,
      from,
      to,
      dir,
      fromEntry,
      toEntry,
      fromRt,
      timeline: null,
      scrubbing,
      buildPending,
      resolve: null,
      fromOmit,
      toOmit,
      magic: !!def.magic,
    };
    this.active = st;
    this.ambientOn = false;
    this.textures.pin([fromEntry?.key ?? '', toEntry.key, this.textures.keyFor(deck, to)]);
    if (this.pixelScale !== 1) this.applySize(); // resolusi turun hanya selama transisi berjalan
    this.requestRender();
    return st;
  }

  /**
   * Akhiri transisi: `snap` = dipotong paksa (navigasi cepat / setData / jeda); `mount` = langsung
   * tampilkan slide tujuan sebagai adegan diam (dimatikan bila pemanggil segera memasang slide lain).
   */
  private finishActive(snap: boolean, mount = true): void {
    const st = this.active;
    if (!st) return;
    this.active = null;
    st.timeline?.kill();
    st.fromRt?.dispose();
    this.magic.end();
    this.setRestVisible();
    if (!st.scrubbing) this.index = st.to;
    if (mount) {
      // Mendarat: teks masuk sesudahnya (kecuali transisi dipotong paksa → tampil utuh).
      this.mountRest(!st.scrubbing && st.buildPending && !snap ? 'text' : 'none', st.dir);
    }
    this.pinCurrent();
    if (this.pixelScale !== 1) this.applySize(); // slide diam → kembali ke resolusi penuh (tajam)
    this.requestRender();
    this.schedulePrefetch();
    st.resolve?.();
  }

  private setRestVisible(): void {
    this.outMesh.visible = false;
    this.inMesh.visible = false;
  }

  /* ------------------------------------------------------------------ */
  /* Resource GPU                                                        */
  /* ------------------------------------------------------------------ */

  private materialsFor(def: TransitionDefinition): [ShaderMaterial, ShaderMaterial] {
    let pair = this.materials.get(def.id);
    if (pair) return pair;
    const vertexShader = buildVertexShader(def.vertex, !!def.tiles);
    const fragmentShader = buildFragmentShader(fragmentFor(def));
    const make = (layer: number) =>
      new ShaderMaterial({
        uniforms: {
          uMap: { value: null },
          uLayer: { value: layer },
          ...this.shared,
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        // Face culling dipakai flip/cube/morph/tiles untuk menyembunyikan sisi belakang;
        // Page Curl justru menampilkan sisi belakang kertas.
        side: def.doubleSided ? DoubleSide : FrontSide,
      });
    pair = [make(0), make(1)];
    this.materials.set(def.id, pair);
    return pair;
  }

  private geometryFor(def: TransitionDefinition): BufferGeometry {
    const scale = this.tierCfg.segmentScale;
    if (def.tiles) {
      // Jumlah ubin ~ kuadrat → kurangi per-sumbu dengan akar skala agar beban GPU proporsional.
      const k = Math.sqrt(scale);
      const [cols, rows] = def.tiles.map((n) => Math.max(1, Math.round(n * k)));
      const key = `tiles:${cols}x${rows}`;
      let g = this.geometries.get(key);
      if (!g) {
        g = buildTileGeometry(cols, rows, PLANE_W, PLANE_H);
        this.geometries.set(key, g);
      }
      return g;
    }
    const [sx, sy] = def.segments.map((s) => (s > 1 ? Math.max(4, Math.round(s * scale)) : 1));
    const key = `${sx}x${sy}`;
    let g = this.geometries.get(key);
    if (!g) {
      g = new PlaneGeometry(PLANE_W, PLANE_H, sx, sy);
      this.geometries.set(key, g);
    }
    return g;
  }

  /** Kompilasi shader di muka agar transisi & adegan pertama tidak tersendat. */
  private async warmup(ids: TransitionId[]): Promise<void> {
    const todo = ids.filter((id) => !this.warmed.has(id));
    const needScene = !this.sceneWarmed && this.sceneEnabled;
    if (!todo.length && !needScene) return;
    todo.forEach((id) => this.warmed.add(id));
    this.sceneWarmed = true;
    const scene = new Scene();
    for (const id of todo) {
      const def = TRANSITIONS[id];
      const mesh = new Mesh(this.geometryFor(def), this.materialsFor(def)[0]);
      mesh.frustumCulled = false;
      scene.add(mesh);
    }
    if (todo.includes('magic')) {
      const m = new Mesh(this.geometries.get('rest')!, this.magic.warmupMaterial);
      m.frustumCulled = false;
      scene.add(m);
    }
    const warm = needScene ? SceneView.warmup() : null;
    if (warm) warm.meshes.forEach((m) => scene.add(m));
    try {
      await this.renderer.compileAsync(scene, this.camera);
    } catch {
      /* kompilasi ulang otomatis saat render pertama */
    }
    scene.clear();
    warm?.dispose();
  }

  /* ------------------------------------------------------------------ */
  /* Loop render                                                         */
  /* ------------------------------------------------------------------ */

  private requestRender(): void {
    this.needsRender = true;
  }

  private tick = (): void => {
    if (this.disposed || this.paused) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTickAt) / 1000);
    this.lastTickAt = now;

    // Gerak ambient: fungsi waktu → terus merender selama slide diam memilikinya.
    if (this.sceneOK() && this.ambientAllowed() && this.viewFresh(this.index) && hasAmbient(this.deck!.slides[this.index])) {
      this.ambientClock += dt;
      this.ambientOn = applyAmbient(this.view, this.deck!.slides[this.index], this.ambientClock);
      if (this.ambientOn) this.needsRender = true;
    } else {
      this.ambientOn = false;
    }

    // Media bergerak: majukan sumber, lukis ulang hanya lapisan yang framenya berubah. Gerak minimal → diam (poster).
    this.updateLive(now / 1000);

    if (!this.needsRender) return;
    this.needsRender = false;
    this.draw();
    this.trackFrame();
  };

  private updateLive(t: number): void {
    this.liveOn = false;
    if (now() - this.lastSweepAt > 400) {
      this.lastSweepAt = now();
      this.images.sweep(t); // video yang slide-nya tak tampil → jeda
    }
    if (this.reducedMotion || !this.sceneOK() || !this.viewFresh(this.index) || !this.view.root.visible) return;
    for (const node of this.view.nodes) {
      const id = node.layer.live;
      if (!id) continue;
      const src = this.images.source(id);
      if (!src) continue;
      this.liveOn = true;
      if (src.update(t)) {
        this.view.repaint(node);
        this.needsRender = true;
      }
    }
  }

  private draw(): void {
    const deck = this.deck;
    if (deck) {
      if (this.active) {
        const st = this.active;
        const [outMat, inMat] = this.materialsFor(st.def);
        // Ambil ulang tiap frame: entri digambar ulang jika edit membuatnya kedaluwarsa.
        outMat.uniforms.uMap.value = st.fromRt
          ? st.fromRt.texture
          : this.textures.get(st.from, deck, this.images, st.fromOmit).texture;
        inMat.uniforms.uMap.value = this.textures.get(st.to, deck, this.images, st.toOmit).texture;
      } else if (this.sceneOK()) {
        // Slide diam: adegan berlapis. Bangun ulang bila masukan berubah (edit teks, gambar dimuat, ukuran).
        if (!this.viewFresh(this.index)) {
          const running = this.entranceTl?.isActive();
          this.buildView(this.index);
          if (running) {
            this.entranceTl?.kill();
            this.entranceTl = null;
          }
          settleEnter(this.view);
          this.reapplyStepState();
          // Pertahankan gerak ambient tanpa kedipan setelah adegan dibangun ulang (mis. saat mengetik).
          const cur = deck.slides[this.index];
          if (this.ambientAllowed() && hasAmbient(cur)) applyAmbient(this.view, cur, this.ambientClock);
        }
        this.view.root.visible = true;
        this.restMesh.visible = false;
      } else {
        // Layar kosong / jalur datar.
        this.view.root.visible = false;
        this.restMesh.visible = true;
        const tex = this.textures.get(this.index, deck, this.images).texture;
        if (this.restMat.map !== tex) {
          const first = !this.restMat.map;
          this.restMat.map = tex;
          if (first) this.restMat.needsUpdate = true;
        }
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** Ukur frame-time; turunkan kualitas otomatis jika transisi terus-menerus lambat. */
  private trackFrame(): void {
    const now = performance.now();
    const dt = now - this.lastFrameAt;
    this.lastFrameAt = now;
    if (dt > 0 && dt < 250) {
      this.avgFrameMs = this.avgFrameMs * 0.9 + dt * 0.1;
      if (this.active && !this.active.scrubbing) {
        if (dt > 28) this.slowFrames++;
        else if (dt < 20) this.slowFrames = Math.max(0, this.slowFrames - 1);
        if (this.slowFrames > 24) this.degrade();
      }
    }
    if (this.opts.onStats && now - this.lastStatsAt > 500) {
      this.lastStatsAt = now;
      this.emitStats();
    }
  }

  private emitStats(): void {
    this.opts.onStats?.({
      fps: Math.round(Math.min(60, 1000 / Math.max(this.avgFrameMs, 1))),
      tier: this.tier,
      backend: this.backend,
      degraded: this.degraded,
      texWidth: this.textures.width,
      transition: this.active ? this.active.def.id : null,
    });
  }

  /** Graceful degradation adaptif: kurangi resolusi render, lalu tier tekstur/mesh. */
  private degrade(): void {
    this.slowFrames = 0;
    this.degraded = true;
    if (this.pixelScale > 0.6) {
      this.pixelScale = Math.max(0.5, this.pixelScale * 0.75);
      this.applySize();
    } else if (this.tier !== 'low') {
      if (this.active) this.finishActive(true);
      this.tier = lowerTier(this.tier);
      this.tierCfg = TIER_CONFIG[this.tier];
      for (const [k, g] of [...this.geometries]) {
        if (k === 'rest') continue;
        g.dispose();
        this.geometries.delete(k);
      }
      this.pixelScale = 1;
      this.applySize();
    }
    this.requestRender();
    this.emitStats();
  }

  private applySize(): void {
    const { w, h, dpr } = this.size;
    const ratio = Math.min(dpr, this.tierCfg.maxDpr);
    // Penurunan resolusi adaptif hanya berlaku SAAT transisi berjalan. Slide yang diam selalu
    // dirender penuh — kalau tidak, gambar statis tetap buram setelah transisi selesai.
    const scale = this.active && !this.active.scrubbing ? this.pixelScale : 1;
    this.renderer.setPixelRatio(ratio * scale);
    this.renderer.setSize(w, h, false);

    // Tekstur slide sepadan dengan piksel fisik bidang slide → tampil 1:1 (tajam), tidak diperbesar.
    const planePx = Math.min(w, (h * PLANE_W) / PLANE_H) * ratio;
    if (this.textures.setTexWidth(pickTexWidth(planePx, this.tierCfg.texW))) this.onTexturesReset();

    const aspect = w / h;
    this.camera.aspect = aspect;
    // Bidang 16:9 selalu utuh: jika layar lebih sempit, perlebar FOV vertikal (letterbox).
    if (aspect >= PLANE_W / PLANE_H) {
      this.camera.fov = BASE_FOV;
    } else {
      const visibleH = PLANE_W / aspect;
      this.camera.fov = 2 * Math.atan(visibleH / 2 / CAM_Z) * (180 / Math.PI);
    }
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  /** Tekstur dibuang karena resolusi berubah: ambil ulang entri transisi yang sedang berjalan. */
  private onTexturesReset(): void {
    const deck = this.deck;
    const st = this.active;
    if (deck && st) {
      st.fromEntry = st.fromRt ? null : this.textures.get(st.from, deck, this.images, st.fromOmit);
      st.toEntry = this.textures.get(st.to, deck, this.images, st.toOmit);
      this.textures.pin([st.fromEntry?.key ?? '', st.toEntry.key, this.textures.keyFor(deck, st.to)]);
    }
    this.requestRender();
  }

  /* ------------------------------------------------------------------ */
  /* Pendukung                                                           */
  /* ------------------------------------------------------------------ */

  private pinCurrent(): void {
    if (!this.deck) return;
    const keys = [this.index - 1, this.index, this.index + 1].map((i) => this.textures.keyFor(this.deck!, i));
    this.textures.pin(keys);
  }

  /** Gambar slide tetangga saat idle sehingga transisi berikutnya instan. */
  private schedulePrefetch(): void {
    if (this.prefetchHandle != null) clearTimeout(this.prefetchHandle);
    this.prefetchHandle = window.setTimeout(() => {
      this.prefetchHandle = null;
      const deck = this.deck;
      if (!deck || this.disposed || this.active) return;
      for (const i of [this.index + 1, this.index - 1]) {
        if (i >= 0 && i < deck.slides.length) this.textures.get(i, deck, this.images);
      }
    }, 120);
  }

  private onContextLost = (e: Event): void => {
    e.preventDefault(); // izinkan browser memulihkan konteks
  };

  private onContextRestored = (): void => {
    this.materials.forEach(([a, b]) => {
      a.needsUpdate = true;
      b.needsUpdate = true;
    });
    this.restMat.needsUpdate = true;
    this.viewIndex = -2; // tekstur adegan dibangun ulang
    this.requestRender();
  };
}
