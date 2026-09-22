import { BufferAttribute, BufferGeometry, Float32BufferAttribute } from 'three';
import { hashString } from '../../utils/hash';

/**
 * Geometri "ubin": setiap sel grid adalah quad TERPISAH (4 vertex sendiri) sehingga vertex shader
 * dapat memutar / melempar tiap ubin secara independen di sekitar pusatnya.
 *
 * Atribut `aTile`: xy = pusat ubin (koordinat dunia), z = nilai acak stabil 0..1 per ubin.
 */
export function buildTileGeometry(cols: number, rows: number, width: number, height: number): BufferGeometry {
  const n = cols * rows;
  const position = new Float32Array(n * 4 * 3);
  const uv = new Float32Array(n * 4 * 2);
  const tile = new Float32Array(n * 4 * 3);
  const index = new Uint16Array(n * 6);

  let v = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const u0 = i / cols;
      const u1 = (i + 1) / cols;
      const v0 = j / rows;
      const v1 = (j + 1) / rows;
      const cx = ((i + 0.5) / cols - 0.5) * width;
      const cy = ((j + 0.5) / rows - 0.5) * height;
      const rnd = (hashString(`${i}:${j}`) >>> 0) / 4294967295;
      const corners: [number, number][] = [
        [u0, v0],
        [u1, v0],
        [u1, v1],
        [u0, v1],
      ];
      corners.forEach(([u, w], k) => {
        const o = v + k;
        position.set([(u - 0.5) * width, (w - 0.5) * height, 0], o * 3);
        uv.set([u, w], o * 2);
        tile.set([cx, cy, rnd], o * 3);
      });
      const t = (j * cols + i) * 6;
      index.set([v, v + 1, v + 2, v, v + 2, v + 3], t);
      v += 4;
    }
  }

  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(position, 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setAttribute('aTile', new Float32BufferAttribute(tile, 3));
  g.setIndex(new BufferAttribute(index, 1));
  return g;
}
