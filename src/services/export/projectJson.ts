import type { Project } from '../../types';

/**
 * Format berkas proyek MorphDeck (dipakai ekspor `.json`, sinkron cloud ke Storage, dan parser impor
 * `.json`). Sengaja dipisah dari `index.ts` — modul itu me-re-export `buildStandaloneHtml`/`buildZip`
 * yang menyeret bundel runtime WebGL (~640 kB, di-`?raw`-import lewat `buildHtml.ts`) — mengimpor
 * fungsi kecil ini SAJA tidak boleh ikut menyeret itu ke bundel yang memuatnya secara statis
 * (mis. `cloudProjects.ts`), atau lazy-loading `ExportMenu.tsx` jadi sia-sia.
 */
export function projectToJson(project: Project): string {
  return JSON.stringify({ format: 'morphdeck-project', version: 1, project }, null, 2);
}
