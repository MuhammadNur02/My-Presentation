import { gsap } from 'gsap';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { cn } from '../../utils/cn';

/** Pembungkus tiap tahap alur: masuk dengan fade + naik halus (GSAP). */
export function StageShell({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(ref.current, { opacity: 0, y: 14, duration: 0.55, ease: 'power3.out' });
    }, ref);
    return () => ctx.revert();
  }, []);
  return (
    <div ref={ref} className={cn('h-full', className)}>
      {children}
    </div>
  );
}
