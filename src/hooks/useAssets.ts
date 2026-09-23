import { useCallback, useState } from 'react';
import { resolveTheme } from '../engine';
import { imageQueryFor } from '../services/ai/keywords';
import { contextImageAsset } from '../services/ai/imageProvider';
import { useProjectStore } from '../store/projectStore';
import { useUIStore } from '../store/uiStore';
import { fileToAsset } from '../utils/image';
import { isMotionFile, motionFileToAsset, sceneAsset } from '../services/media/assets';
import { gifCandidateToAsset, type GifCandidate } from '../services/media/giphy';
import type { Asset, LayoutId } from '../types';

/** Layout yang punya slot foto/animasi. Layout lain (kutipan, statistik, dst.) tidak menampilkan media. */
const MEDIA_LAYOUTS: LayoutId[] = ['auto', 'title', 'content', 'split', 'image-full'];

/** Aksi aset bersama (unggah gambar/logo, buat gambar kontekstual) untuk editor & pustaka aset. */
export function useAssets() {
  const [busy, setBusy] = useState(false);

  const toastError = (err: unknown) =>
    useUIStore.getState().toast(err instanceof Error ? err.message : 'Gagal memproses gambar', 'error');

  /** Pasang aset animasi ke slide; bila layout slide tak punya slot media, layout diganti ke Split agar animasi tampil. */
  const applyMotion = useCallback((slideId: string, asset: Asset) => {
    const store = useProjectStore.getState();
    const slide = store.project?.slides.find((s) => s.id === slideId);
    store.addAsset(asset);
    const patch: { imageId: string; layout?: LayoutId } = { imageId: asset.id };
    let swapped = false;
    if (slide && !MEDIA_LAYOUTS.includes(slide.layout)) {
      patch.layout = 'split';
      swapped = true;
    }
    store.updateSlide(slideId, patch);
    useUIStore
      .getState()
      .toast(swapped ? 'Animasi dipasang. Layout diganti ke Split agar animasi tampil.' : 'Animasi dipasang di slide ini.', 'success');
  }, []);

  const uploadMotion = useCallback(
    async (file: File, applyToSlideId?: string) => {
      try {
        setBusy(true);
        const asset = await motionFileToAsset(file);
        if (applyToSlideId) applyMotion(applyToSlideId, asset);
        else {
          useProjectStore.getState().addAsset(asset);
          const ui = useUIStore.getState();
          ui.setAssetMode('animation'); // animasi tidak tampil di pustaka gambar
          ui.toast(`“${asset.name}” ditambahkan ke Pustaka animasi. Pilih untuk memasangnya di slide.`, 'success');
        }
        return asset;
      } catch (err) {
        toastError(err);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [applyMotion],
  );

  const applyScene = useCallback(
    (slideId: string, sceneId: string) => {
      const project = useProjectStore.getState().project;
      if (!project) return;
      applyMotion(slideId, sceneAsset(sceneId, project.language, project.assets));
    },
    [applyMotion],
  );

  const applyGif = useCallback(
    async (slideId: string, c: GifCandidate) => {
      try {
        setBusy(true);
        applyMotion(slideId, await gifCandidateToAsset(c));
      } catch (err) {
        toastError(err);
      } finally {
        setBusy(false);
      }
    },
    [applyMotion],
  );

  const uploadImage = useCallback(async (file: File, applyToSlideId?: string) => {
    if (isMotionFile(file)) return uploadMotion(file, applyToSlideId);
    if (!file.type.startsWith('image/')) {
      useUIStore.getState().toast('Berkas harus berupa gambar (JPG, PNG, WebP, SVG) atau animasi (GIF, MP4, WebM).', 'error');
      return null;
    }
    try {
      setBusy(true);
      const asset = await fileToAsset(file, 'image');
      const store = useProjectStore.getState();
      store.addAsset(asset);
      if (applyToSlideId) store.updateSlide(applyToSlideId, { imageId: asset.id });
      return asset;
    } catch (err) {
      toastError(err);
      return null;
    } finally {
      setBusy(false);
    }
  }, [uploadMotion]);

  const uploadLogo = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      useUIStore.getState().toast('Logo harus berupa gambar (PNG transparan disarankan).', 'error');
      return null;
    }
    try {
      setBusy(true);
      const asset = await fileToAsset(file, 'logo');
      const store = useProjectStore.getState();
      store.addAsset(asset);
      store.setLogo(asset.id);
      return asset;
    } catch (err) {
      toastError(err);
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  /** Buat/ganti gambar kontekstual untuk slide (seni generatif — fitur foto stok pribadi sudah dihapus). */
  const generateForSlide = useCallback(async (slideId: string) => {
    const store = useProjectStore.getState();
    const project = store.project;
    const slide = project?.slides.find((s) => s.id === slideId);
    if (!project || !slide) return;
    try {
      setBusy(true);
      const query = slide.imageQuery.trim() || imageQueryFor(slide.title, slide.subtitle);
      const asset = await contextImageAsset(query, {
        unsplashKey: '',
        theme: resolveTheme(project.theme),
        variant: Math.floor(Math.random() * 10_000),
      });
      store.addAsset(asset);
      store.updateSlide(slideId, { imageId: asset.id, imageQuery: query });
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, uploadImage, uploadLogo, generateForSlide, uploadMotion, applyScene, applyGif, applyMotion };
}
