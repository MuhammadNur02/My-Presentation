const STOP = new Set(
  (
    'yang dan di ke dari untuk pada dengan adalah ini itu atau juga akan dalam oleh sebagai para serta bagi ' +
    'tentang agar dapat bisa lebih sangat setiap semua antara kita kami mereka anda tidak ada apa bagaimana ' +
    'mengapa the a an and or of to in on for with is are was were be been this that these those from by as at ' +
    'it its your our their about into how why what can will more most very each all between we you they not ' +
    'presentasi presentation slide slides tentang buatkan buat tolong please make create'
  ).split(' '),
);

/** Kata kunci sederhana: buang stopword, urutkan menurut panjang & kemunculan. */
export function extractKeywords(text: string, max = 3): string[] {
  const words = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));
  const score = new Map<string, number>();
  words.forEach((w, i) => score.set(w, (score.get(w) ?? 0) + w.length + Math.max(0, 6 - i)));
  return [...score.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([w]) => w);
}

/** Kueri gambar dari judul + subjudul (fallback bila AI tidak memberi image_query). */
export function imageQueryFor(title: string, subtitle = ''): string {
  return extractKeywords(`${title} ${subtitle}`, 3).join(' ') || 'abstract';
}
