import { Bold, Highlighter, Italic } from 'lucide-react';
import { useRef } from 'react';
import { IconButton, inputClass } from '../common/ui';
import { cn } from '../../utils/cn';

interface Props {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
  className?: string;
}

/** Textarea dengan toolbar rich text: sisipkan penanda **tebal**, *miring*, ==sorot== pada pilihan. */
export function RichTextArea({ value, onChange, rows = 3, placeholder, className }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const wrap = (marker: string) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: s, selectionEnd: e } = el;
    const before = value.slice(0, s);
    const sel = value.slice(s, e);
    const after = value.slice(e);
    // Jika sudah terbungkus penanda yang sama → lepas (toggle).
    if (before.endsWith(marker) && after.startsWith(marker)) {
      onChange(before.slice(0, -marker.length) + sel + after.slice(marker.length));
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(s - marker.length, e - marker.length);
      });
      return;
    }
    onChange(before + marker + sel + marker + after);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + marker.length, e + marker.length);
    });
  };

  return (
    <div className={cn('rounded-xl bg-field transition focus-within:ring-1 focus-within:ring-accent/60', className)}>
      <div className="flex items-center gap-0.5 border-b border-line/60 px-1.5 py-1">
        <IconButton label="Tebal (**teks**)" onClick={() => wrap('**')} type="button">
          <Bold className="size-3.5" />
        </IconButton>
        <IconButton label="Miring (*teks*)" onClick={() => wrap('*')} type="button">
          <Italic className="size-3.5" />
        </IconButton>
        <IconButton label="Sorot warna aksen (==teks==)" onClick={() => wrap('==')} type="button">
          <Highlighter className="size-3.5" />
        </IconButton>
      </div>
      <textarea
        ref={ref}
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
            e.preventDefault();
            wrap('**');
          } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
            e.preventDefault();
            wrap('*');
          }
        }}
        className={cn(inputClass, 'resize-none rounded-t-none bg-transparent focus:bg-transparent')}
      />
    </div>
  );
}
