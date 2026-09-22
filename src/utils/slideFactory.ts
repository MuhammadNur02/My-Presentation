import { defaultTransition } from '../engine/transitions/definitions';
import type { Slide } from '../types';
import { uid } from './id';

export function createSlide(partial: Partial<Slide> = {}): Slide {
  return {
    id: uid('s'),
    layout: 'auto',
    title: '',
    subtitle: '',
    bullets: [],
    notes: '',
    imageId: null,
    imageQuery: '',
    heroTag: 'hero',
    showLogo: true,
    textScale: 1,
    build: 'fade-up',
    transition: defaultTransition('fade'),
    ...partial,
  };
}

/** Salin slide dengan id baru (untuk duplikasi). */
export function cloneSlide(slide: Slide): Slide {
  return { ...slide, id: uid('s'), bullets: [...slide.bullets], transition: { ...slide.transition } };
}
