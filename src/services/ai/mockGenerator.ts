import type { Language, Tone } from '../../types';
import { extractKeywords } from './keywords';
import type { Outline, OutlineRequest, OutlineSlide } from './outline';

/**
 * Generator outline OFFLINE (simulasi AI). Dipakai bila kunci API belum diisi — hasilnya
 * berupa kerangka presentasi yang koheren dari topik apa pun, siap disunting pengguna.
 */

type RoleId =
  | 'agenda'
  | 'context'
  | 'challenge'
  | 'approach'
  | 'process'
  | 'insight'
  | 'benefits'
  | 'roadmap'
  | 'takeaways';

interface Copy {
  coverSub: Record<Tone, string>;
  closing: { title: string; subtitle: string; notes: string };
  agendaTitle: Record<Tone, string>;
  roles: Record<RoleId, (t: string, max: number) => Omit<OutlineSlide, 'imageQuery'>>;
  extra: (t: string, n: number) => Omit<OutlineSlide, 'imageQuery'>;
}

const ID: Copy = {
  coverSub: {
    professional: 'Ringkasan strategis, temuan utama, dan langkah lanjutan',
    creative: 'Sebuah perjalanan visual menuju ide yang layak diperjuangkan',
    minimal: 'Satu gagasan. Satu arah.',
    educational: 'Panduan bertahap untuk memahami dan menerapkannya',
  },
  closing: {
    title: 'Terima kasih',
    subtitle: 'Diskusi & tanya jawab',
    notes: 'Tutup dengan ringkasan satu kalimat, ajakan bertindak yang jelas, lalu buka sesi tanya jawab.',
  },
  agendaTitle: {
    professional: 'Agenda',
    creative: 'Peta perjalanan',
    minimal: 'Agenda',
    educational: 'Tujuan pembelajaran',
  },
  roles: {
    agenda: () => ({
      layout: 'content',
      title: 'Agenda',
      subtitle: '',
      bullets: [],
      notes: 'Jelaskan alur presentasi secara singkat agar audiens tahu apa yang akan dibahas.',
    }),
    context: (t, m) => ({
      layout: 'split',
      title: 'Latar belakang',
      subtitle: `Mengapa ${t} penting saat ini`,
      bullets: [
        `**${t}** semakin menentukan cara kita bekerja dan berkompetisi`,
        'Ekspektasi pengguna dan pemangku kepentingan terus meningkat',
        'Peluang terbesar ada pada mereka yang bergerak lebih awal',
        'Kita membutuhkan pemahaman bersama sebelum melangkah',
      ].slice(0, m),
      notes: `Bangun konteks: jelaskan mengapa ${t} relevan sekarang dan siapa yang terdampak.`,
    }),
    challenge: (t, m) => ({
      layout: 'content',
      title: 'Tantangan utama',
      subtitle: `Hambatan yang perlu diatasi dalam ${t}`,
      bullets: [
        'Tujuan belum dirumuskan dengan ukuran keberhasilan yang jelas',
        'Sumber daya dan waktu terbatas, prioritas harus tegas',
        'Perbedaan pemahaman antar tim memperlambat keputusan',
        'Risiko perlu dikelola tanpa mematikan inovasi',
      ].slice(0, m),
      notes: 'Sampaikan tantangan secara jujur; ini membuat solusi berikutnya terasa masuk akal.',
    }),
    approach: (t, m) => ({
      layout: 'split',
      title: 'Pendekatan kami',
      subtitle: `Kerangka kerja untuk ${t}`,
      bullets: [
        '==Mulai dari masalah==, bukan dari solusi',
        'Uji asumsi paling berisiko lebih dulu dengan eksperimen kecil',
        'Ukur dampak dengan indikator yang disepakati bersama',
        'Iterasi cepat, dokumentasikan pelajaran',
      ].slice(0, m),
      notes: 'Jelaskan logika pendekatan, bukan hanya daftar langkahnya.',
    }),
    process: () => ({
      layout: 'numbered',
      title: 'Alur kerja',
      subtitle: 'Empat tahap dari ide hingga dampak',
      bullets: ['Riset & pahami masalahnya', 'Rancang solusi yang tepat', 'Uji & validasi dengan pengguna', 'Luncurkan & ukur dampaknya'],
      notes: 'Setiap tahap punya keluaran yang jelas. Tekankan bahwa tahap 3 dan 4 berulang.',
    }),
    insight: (t) => ({
      layout: 'quote',
      title: `Kemajuan dalam ${t} lahir dari langkah kecil yang dilakukan secara konsisten`,
      subtitle: 'Prinsip kerja',
      bullets: [],
      notes: 'Beri jeda sejenak setelah kutipan agar pesan meresap.',
    }),
    benefits: (t, m) => ({
      layout: 'content',
      title: 'Manfaat yang diharapkan',
      subtitle: `Nilai dari penerapan ${t}`,
      bullets: [
        '**Efisiensi** — pekerjaan berulang berkurang, fokus pada hal bernilai',
        '**Kualitas** — keputusan didukung data dan umpan balik nyata',
        '**Kecepatan** — siklus belajar yang lebih pendek',
        '**Keselarasan** — semua pihak bergerak ke arah yang sama',
      ].slice(0, m),
      notes: 'Kaitkan tiap manfaat dengan kebutuhan audiens yang hadir.',
    }),
    roadmap: () => ({
      layout: 'timeline',
      title: 'Peta jalan',
      subtitle: 'Fase implementasi',
      bullets: ['Fase 1 | Fondasi', 'Fase 2 | Pilot', 'Fase 3 | Perluasan', 'Fase 4 | Optimasi'],
      notes: 'Sebutkan perkiraan waktu dan penanggung jawab tiap fase secara lisan.',
    }),
    takeaways: (t, m) => ({
      layout: 'content',
      title: 'Poin penting',
      subtitle: `Yang perlu diingat tentang ${t}`,
      bullets: [
        `Pahami konteks **${t}** sebelum memilih solusi`,
        'Mulai kecil, ukur, lalu perluas',
        'Libatkan pemangku kepentingan sejak awal',
        'Tetapkan langkah berikutnya hari ini',
      ].slice(0, m),
      notes: 'Ulangi tiga pesan utama dan tutup dengan langkah berikutnya yang konkret.',
    }),
  },
  extra: (t, n) => ({
    layout: 'content',
    title: `Kajian mendalam ${n}`,
    subtitle: t,
    bullets: ['Gambaran situasi saat ini', 'Temuan penting dan implikasinya', 'Rekomendasi tindak lanjut'],
    notes: 'Sesuaikan bagian ini dengan data atau contoh kasus Anda sendiri.',
  }),
};

const EN: Copy = {
  coverSub: {
    professional: 'Strategic summary, key findings, and next steps',
    creative: 'A visual journey toward an idea worth fighting for',
    minimal: 'One idea. One direction.',
    educational: 'A step-by-step guide to understand and apply it',
  },
  closing: {
    title: 'Thank you',
    subtitle: 'Discussion & Q&A',
    notes: 'Close with a one-line summary, a clear call to action, then open the floor for questions.',
  },
  agendaTitle: {
    professional: 'Agenda',
    creative: 'The journey ahead',
    minimal: 'Agenda',
    educational: 'Learning objectives',
  },
  roles: {
    agenda: () => ({
      layout: 'content',
      title: 'Agenda',
      subtitle: '',
      bullets: [],
      notes: 'Briefly outline the flow so the audience knows what to expect.',
    }),
    context: (t, m) => ({
      layout: 'split',
      title: 'Background',
      subtitle: `Why ${t} matters now`,
      bullets: [
        `**${t}** increasingly shapes how we work and compete`,
        'User and stakeholder expectations keep rising',
        'The biggest opportunities go to those who move early',
        'We need shared understanding before moving forward',
      ].slice(0, m),
      notes: `Set the context: explain why ${t} is relevant today and who is affected.`,
    }),
    challenge: (t, m) => ({
      layout: 'content',
      title: 'Key challenges',
      subtitle: `Obstacles to overcome in ${t}`,
      bullets: [
        'Goals lack clear success measures',
        'Time and resources are limited — priorities must be sharp',
        'Different understandings across teams slow decisions',
        'Risk must be managed without killing innovation',
      ].slice(0, m),
      notes: 'Be candid about the challenges; it makes the solution feel earned.',
    }),
    approach: (t, m) => ({
      layout: 'split',
      title: 'Our approach',
      subtitle: `A framework for ${t}`,
      bullets: [
        '==Start from the problem==, not the solution',
        'Test the riskiest assumptions first with small experiments',
        'Measure impact with agreed indicators',
        'Iterate fast and document what you learn',
      ].slice(0, m),
      notes: 'Explain the logic behind the approach, not only the list of steps.',
    }),
    process: () => ({
      layout: 'numbered',
      title: 'Workflow',
      subtitle: 'Four stages from idea to impact',
      bullets: ['Research & understand the problem', 'Design the right solution', 'Test & validate with users', 'Launch & measure the impact'],
      notes: 'Each stage has a clear output. Stress that stages 3 and 4 repeat.',
    }),
    insight: (t) => ({
      layout: 'quote',
      title: `Progress in ${t} is built from small steps taken consistently`,
      subtitle: 'Working principle',
      bullets: [],
      notes: 'Pause briefly after the quote so the message lands.',
    }),
    benefits: (t, m) => ({
      layout: 'content',
      title: 'Expected benefits',
      subtitle: `The value of applying ${t}`,
      bullets: [
        '**Efficiency** — less repetitive work, more focus on value',
        '**Quality** — decisions backed by data and real feedback',
        '**Speed** — shorter learning cycles',
        '**Alignment** — everyone moves in the same direction',
      ].slice(0, m),
      notes: 'Tie each benefit to a need of the people in the room.',
    }),
    roadmap: () => ({
      layout: 'timeline',
      title: 'Roadmap',
      subtitle: 'Implementation phases',
      bullets: ['Phase 1 | Foundation', 'Phase 2 | Pilot', 'Phase 3 | Scale', 'Phase 4 | Optimize'],
      notes: 'Mention rough timing and owners for each phase verbally.',
    }),
    takeaways: (t, m) => ({
      layout: 'content',
      title: 'Key takeaways',
      subtitle: `What to remember about ${t}`,
      bullets: [
        `Understand the context of **${t}** before choosing solutions`,
        'Start small, measure, then expand',
        'Involve stakeholders early',
        'Decide the next step today',
      ].slice(0, m),
      notes: 'Repeat the three key messages and end with a concrete next step.',
    }),
  },
  extra: (t, n) => ({
    layout: 'content',
    title: `Deep dive ${n}`,
    subtitle: t,
    bullets: ['Current situation', 'Key findings and implications', 'Recommended follow-up'],
    notes: 'Adapt this section with your own data or case studies.',
  }),
};

const COPY: Record<Language, Copy> = { id: ID, en: EN };

/** Urutan peran bagian tengah (dipilih merata sesuai jumlah slide). */
const MIDDLE: RoleId[] = ['agenda', 'context', 'challenge', 'approach', 'process', 'insight', 'benefits', 'roadmap', 'takeaways'];

function pickRoles(middleCount: number): (RoleId | 'extra')[] {
  if (middleCount <= 0) return [];
  if (middleCount >= MIDDLE.length) {
    return [...MIDDLE, ...Array<'extra'>(middleCount - MIDDLE.length).fill('extra')];
  }
  // Pilih merata namun selalu sertakan "agenda" (awal) dan "takeaways" (akhir).
  const out: RoleId[] = [];
  for (let i = 0; i < middleCount; i++) {
    const pos = middleCount === 1 ? 3 : Math.round((i * (MIDDLE.length - 1)) / (middleCount - 1));
    out.push(MIDDLE[pos]);
  }
  return out;
}

function shortTopic(topic: string): string {
  const first = topic.trim().split(/\n|[.!?](?:\s|$)/)[0].trim();
  const t = first.length > 70 ? first.slice(0, 67).replace(/\s+\S*$/, '') + '…' : first;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(id);
      reject(new DOMException('Dibatalkan', 'AbortError'));
    });
  });

export async function generateMockOutline(req: OutlineRequest, signal?: AbortSignal): Promise<Outline> {
  // Simulasi latensi pemanggilan model agar alur UI terasa nyata.
  await wait(900 + Math.min(900, req.slideCount * 60), signal);

  const copy = COPY[req.language];
  const topic = shortTopic(req.topic) || (req.language === 'id' ? 'Topik presentasi' : 'Presentation topic');
  const kws = extractKeywords(req.topic, 2);
  const kw = kws.join(' ') || 'abstract';
  const maxBullets = req.tone === 'minimal' ? 3 : 4;
  const count = Math.max(3, Math.min(30, req.slideCount));

  const slides: OutlineSlide[] = [];
  slides.push({
    layout: 'title',
    title: topic,
    subtitle: copy.coverSub[req.tone],
    bullets: [],
    notes: req.language === 'id' ? 'Sapa audiens, perkenalkan diri, dan nyatakan tujuan presentasi dalam satu kalimat.' : 'Greet the audience, introduce yourself, and state the goal in one sentence.',
    imageQuery: `${kw} concept`,
  });

  const roles = pickRoles(count - 2);
  let extraN = 0;
  const middle: OutlineSlide[] = roles.map((role, i) => {
    const base = role === 'extra' ? copy.extra(topic, ++extraN) : copy.roles[role](topic, maxBullets);
    return { ...base, imageQuery: `${kw} ${role === 'extra' ? 'detail' : role}${i % 2 ? ' abstract' : ''}` };
  });

  // Agenda memuat judul bagian lain → benar-benar berguna sebagai daftar isi.
  const agenda = middle.find((_s, i) => roles[i] === 'agenda');
  if (agenda) {
    agenda.title = copy.agendaTitle[req.tone];
    agenda.bullets = middle
      .filter((s) => s !== agenda && s.layout !== 'quote') // kutipan bukan bagian yang layak masuk daftar isi
      .map((s) => s.title)
      .slice(0, req.tone === 'minimal' ? 3 : 5);
  }
  slides.push(...middle);

  slides.push({
    layout: 'image-full',
    title: copy.closing.title,
    subtitle: copy.closing.subtitle,
    bullets: [],
    notes: copy.closing.notes,
    imageQuery: `${kw} horizon`,
  });

  return { title: topic, slides };
}
