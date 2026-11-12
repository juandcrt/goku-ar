// Genera torre.glb: Torre Eiffel con estructura de celosía, estática.
// Medidas en metros reales (330 m de alto); el nodo raíz la escala a ALTURA_AR.
// Sin dependencias: node herramientas/generar-torre.mjs
import { writeFileSync } from 'node:fs';

const ALTURA_AR = 1.5; // metros que mide en AR (se puede pellizcar para cambiar)

// ---------- matemáticas ----------
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return mul(a, 1 / l); };
const lerp = (a, b, t) => add(a, mul(sub(b, a), t));

// ---------- geometría por material ----------
const hex = (h) => [0, 2, 4].map((i) => {
  const c = parseInt(h.slice(i + 1, i + 3), 16) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});
const MATS = {
  hierro: { color: '#b98f5c', metal: 0.35, rough: 0.55 },
  oscuro: { color: '#4b3323', metal: 0.3, rough: 0.6 },
  ventana: { color: '#24180f', metal: 0.1, rough: 0.8 },
};
const geo = Object.fromEntries(Object.keys(MATS).map((m) => [m, { pos: [], nor: [], idx: [] }]));

// viga de sección cuadrada de a -> b (sin tapas, normales suaves: se ve como perfil redondeado)
function beam(a, b, w, mat = 'hierro') {
  const g = geo[mat], d = norm(sub(b, a));
  const helper = Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = norm(cross(d, helper)), v = cross(d, u);
  const offs = [add(u, v), sub(v, u), mul(add(u, v), -1), sub(u, v)].map((o) => mul(o, w / 2));
  const base = g.pos.length;
  for (const p of [a, b]) for (const o of offs) { g.pos.push(add(p, o)); g.nor.push(norm(o)); }
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4, q = [base + i, base + j, base + 4 + j, base + 4 + i];
    const n = cross(sub(g.pos[q[1]], g.pos[q[0]]), sub(g.pos[q[2]], g.pos[q[0]]));
    const outward = dot(n, add(offs[i], offs[j])) > 0;
    g.idx.push(...(outward ? [q[0], q[1], q[2], q[0], q[2], q[3]] : [q[0], q[2], q[1], q[0], q[3], q[2]]));
  }
}

// caja alineada a los ejes (normales planas)
function box(min, max, mat) {
  const g = geo[mat];
  const faces = [
    [[1, 0, 0], [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]],
    [[-1, 0, 0], [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]]],
    [[0, 1, 0], [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]]],
    [[0, -1, 0], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]],
    [[0, 0, 1], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]],
    [[0, 0, -1], [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]]],
  ];
  for (const [n, corners] of faces) {
    const base = g.pos.length;
    for (const c of corners) { g.pos.push(c.map((k, i) => (k ? max[i] : min[i]))); g.nor.push(n); }
    g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}
// caja centrada en x/z con semiancho h, de y0 a y1
const sqBox = (h, y0, y1, mat) => box([-h, y0, -h], [h, y1, h], mat);

// marco cuadrado (plataforma con hueco al centro)
function ring(hOut, hIn, y0, y1, mat) {
  box([-hOut, y0, hIn], [hOut, y1, hOut], mat);
  box([-hOut, y0, -hOut], [hOut, y1, -hIn], mat);
  box([hIn, y0, -hIn], [hOut, y1, hIn], mat);
  box([-hOut, y0, -hIn], [-hIn, y1, hIn], mat);
}

// ---------- celosía ----------
const CHORD = 2.2, HORIZ = 1.2, DIAG = 0.95;
const SIGNS = [[1, 1], [-1, 1], [-1, -1], [1, -1]];

// tubo de celosía: corners(y) devuelve 4 esquinas en orden alrededor del perímetro
function latticeTube(corners, heights, { diag = true } = {}) {
  for (let i = 0; i < heights.length; i++) {
    const c = corners(heights[i]);
    for (let k = 0; k < 4; k++) beam(c[k], c[(k + 1) % 4], HORIZ);
    if (i === 0) continue;
    const p = corners(heights[i - 1]);
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      beam(p[k], c[k], CHORD);
      if (diag) { beam(p[k], c[k2], DIAG); beam(p[k2], c[k], DIAG); }
    }
  }
}
const range = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);

// pata: centro (cx, cz) * signo, lado s
const legCorners = (sx, sz, center, size) => (y) => {
  const c = center(y), s = size(y) / 2;
  return SIGNS.map(([a, b]) => [sx * c + a * s, y, sz * c + b * s]);
};

// Tramo A: del suelo a la 1ª plataforma (57 m), 4 patas curvas
const cA = (y) => 28 + 22 * (1 - y / 57) ** 1.5;
const sA = (y) => 14 + 11 * (1 - y / 57) ** 1.2;
// Tramo B: de la 1ª (67 m) a la 2ª plataforma (115 m)
const cB = (y) => 11 + 17 * (1 - (y - 67) / 48) ** 1.25;
const sB = (y) => 8 + 6 * (1 - (y - 67) / 48);
// Tramo C: fuste único de 120 m a 276 m
const hC = (y) => 5.5 + 9.5 * ((276 - y) / 156) ** 1.6;

for (const [sx, sz] of SIGNS) {
  latticeTube(legCorners(sx, sz, cA, sA), range(0, 57, 10));
  latticeTube(legCorners(sx, sz, cB, sB), range(67, 115, 8));
  // tramos ocultos dentro de las plataformas para que las patas sean continuas
  const a = legCorners(sx, sz, cA, sA)(57), b = legCorners(sx, sz, cB, sB)(67);
  for (let k = 0; k < 4; k++) beam(a[k], b[k], CHORD);
  const c = legCorners(sx, sz, cB, sB)(115);
  for (let k = 0; k < 4; k++) beam(c[k], [c[k][0], 120, c[k][2]], CHORD);
  // zapata de piedra bajo cada pata
  const cx = sx * cA(0), cz = sz * cA(0), h = sA(0) / 2 + 1.5;
  box([cx - h, -0.01, cz - h], [cx + h, 2.5, cz + h], 'oscuro');
}
latticeTube((y) => { const h = hC(y); return SIGNS.map(([a, b]) => [a * h, y, b * h]); }, range(120, 276, 16));

// Arcos decorativos entre patas (uno por lado), con doble nervio y montantes
const ARCH_TOP = 39, ARCH_SPRING = 6, ARCH_PLANE = 35;
for (let side = 0; side < 4; side++) {
  // lado en el eje z (+/-) o x (+/-)
  const sgn = side < 2 ? 1 : -1, alongX = side % 2 === 0;
  // el arco va en un plano vertical justo dentro del borde de la 1ª plataforma
  const pt = (x, y) => (alongX ? [x, y, sgn * ARCH_PLANE] : [sgn * ARCH_PLANE, y, x]);
  const inner = (y) => cA(y) - sA(y) / 2; // borde interior de las patas
  const N = 20, outer = [], innerRib = [];
  for (let i = 0; i <= N; i++) {
    const t = -1 + (2 * i) / N, x0 = inner(ARCH_SPRING);
    const y = ARCH_SPRING + (ARCH_TOP - ARCH_SPRING) * Math.sqrt(Math.max(0, 1 - t * t));
    outer.push(pt(t * x0, y));
    innerRib.push(pt(t * (x0 - 2.5), y - 3.2 * Math.sqrt(Math.max(0, 1 - t * t)) - 0.01));
  }
  for (let i = 0; i < N; i++) {
    beam(outer[i], outer[i + 1], CHORD);
    beam(innerRib[i], innerRib[i + 1], HORIZ);
    beam(outer[i], innerRib[i + 1], DIAG);
  }
  // celosía entre el arco y la plataforma
  for (let i = 2; i < N - 1; i += 2) {
    const top = [outer[i][0], 57, outer[i][2]];
    beam(outer[i], top, DIAG);
  }
}

// ---------- plataformas ----------
// 1ª plataforma (57–67 m): piso, fachada con ventanas en arco, cornisa oscura
ring(36, 21, 57, 58.5, 'oscuro');
ring(35.5, 34.2, 58.5, 65, 'hierro');
ring(22, 21, 58.5, 65, 'hierro');
ring(36.8, 21, 65, 67, 'oscuro');
for (let i = -10; i <= 10; i++) {
  const x = i * 3.2;
  for (const [a, b] of [[x - 0.9, 35.5], [x - 0.9, -35.7]]) {
    box([a, 59.5, Math.min(b, b + 0.2)], [a + 1.8, 63.5, Math.max(b, b + 0.2)], 'ventana');
    box([Math.min(b, b + 0.2), 59.5, a], [Math.max(b, b + 0.2), 63.5, a + 1.8], 'ventana');
  }
}
// barandal
for (let i = -11; i <= 11; i++) {
  const x = i * 3.2;
  for (const [px, pz] of [[x, 36.3], [x, -36.3], [36.3, x], [-36.3, x]]) beam([px, 67, pz], [px, 69, pz], 0.5, 'oscuro');
}
for (const [a, b] of [[[-36.3, 69, 36.3], [36.3, 69, 36.3]], [[36.3, 69, 36.3], [36.3, 69, -36.3]], [[36.3, 69, -36.3], [-36.3, 69, -36.3]], [[-36.3, 69, -36.3], [-36.3, 69, 36.3]]]) {
  beam(a, b, 0.6, 'oscuro');
}

// 2ª plataforma (115–120 m)
ring(20.5, 7, 115, 116.2, 'oscuro');
ring(20, 19, 116.2, 119, 'hierro');
ring(21, 7, 119, 120.5, 'oscuro');
for (let i = -5; i <= 5; i++) {
  const x = i * 3.3;
  box([x - 0.8, 116.8, 20], [x + 0.8, 118.6, 20.15], 'ventana');
  box([x - 0.8, 116.8, -20.15], [x + 0.8, 118.6, -20], 'ventana');
  box([20, 116.8, x - 0.8], [20.15, 118.6, x + 0.8], 'ventana');
  box([-20.15, 116.8, x - 0.8], [-20, 118.6, x + 0.8], 'ventana');
}

// 3ª plataforma, cúpula, linterna y antena
sqBox(8.5, 276, 277.5, 'oscuro');
sqBox(7.8, 277.5, 283, 'hierro');
sqBox(8.8, 283, 284.5, 'oscuro');
sqBox(5.8, 284.5, 293, 'hierro');
sqBox(6.4, 293, 294.5, 'oscuro');
sqBox(4.2, 294.5, 301, 'hierro');
sqBox(4.8, 301, 302.3, 'oscuro');
sqBox(2.6, 302.3, 308, 'hierro');
beam([0, 308, 0], [0, 316, 0], 2.2, 'oscuro');
beam([0, 316, 0], [0, 330, 0], 0.9, 'oscuro');
// ventanas en el centro de cada cara de la cúpula y la linterna
for (const [y, h, w] of [[288.8, 5.8, 1.6], [297.8, 4.2, 1.1]]) for (let k = -1; k <= 1; k++) {
  const x = k * w * 2.2;
  box([x - w / 2, y - 2.2, h - 0.05], [x + w / 2, y + 2.2, h + 0.15], 'ventana');
  box([x - w / 2, y - 2.2, -h - 0.15], [x + w / 2, y + 2.2, -h + 0.05], 'ventana');
  box([h - 0.05, y - 2.2, x - w / 2], [h + 0.15, y + 2.2, x + w / 2], 'ventana');
  box([-h - 0.15, y - 2.2, x - w / 2], [-h + 0.05, y + 2.2, x + w / 2], 'ventana');
}

// ---------- escritor GLB ----------
const SCALE = ALTURA_AR / 330;
const chunks = []; let byteLength = 0;
const gltf = {
  asset: { version: '2.0', generator: 'generar-torre.mjs' },
  scene: 0, scenes: [{ nodes: [0] }],
  nodes: [{ name: 'TorreEiffel', scale: [SCALE, SCALE, SCALE], mesh: 0 }],
  meshes: [{ name: 'Torre', primitives: [] }], accessors: [], bufferViews: [],
  materials: Object.entries(MATS).map(([name, m]) => ({
    name, pbrMetallicRoughness: { baseColorFactor: [...hex(m.color), 1], metallicFactor: m.metal, roughnessFactor: m.rough },
  })),
  buffers: [],
};

function accessor(arr, type, target, minmax = false) {
  const buf = Buffer.from(arr.buffer);
  const pad = (4 - (buf.length % 4)) % 4;
  gltf.bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: buf.length, target });
  chunks.push(buf, Buffer.alloc(pad)); byteLength += buf.length + pad;
  const comps = type === 'VEC3' ? 3 : 1;
  const componentType = arr instanceof Float32Array ? 5126 : arr instanceof Uint32Array ? 5125 : 5123;
  const acc = { bufferView: gltf.bufferViews.length - 1, componentType, count: arr.length / comps, type };
  if (minmax) {
    acc.min = [Infinity, Infinity, Infinity]; acc.max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < arr.length; i++) { acc.min[i % 3] = Math.min(acc.min[i % 3], arr[i]); acc.max[i % 3] = Math.max(acc.max[i % 3], arr[i]); }
  }
  gltf.accessors.push(acc);
  return gltf.accessors.length - 1;
}

let tris = 0;
Object.entries(geo).forEach(([mat, g], m) => {
  if (!g.idx.length) return;
  const idx = g.pos.length > 65535 ? new Uint32Array(g.idx) : new Uint16Array(g.idx);
  tris += g.idx.length / 3;
  gltf.meshes[0].primitives.push({
    attributes: {
      POSITION: accessor(new Float32Array(g.pos.flat()), 'VEC3', 34962, true),
      NORMAL: accessor(new Float32Array(g.nor.flat()), 'VEC3', 34962),
    },
    indices: accessor(idx, 'SCALAR', 34963),
    material: m, mode: 4,
  });
});

const bin = Buffer.concat(chunks);
gltf.buffers.push({ byteLength: bin.length });
let json = Buffer.from(JSON.stringify(gltf));
json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
const chunkHead = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(type, 4); return b; };
writeFileSync(new URL('../torre.glb', import.meta.url),
  Buffer.concat([header, chunkHead(json.length, 0x4e4f534a), json, chunkHead(bin.length, 0x004e4942), bin]));
console.log(`torre.glb: ${((12 + 16 + json.length + bin.length) / 1024).toFixed(0)} KB, ${tris} triángulos, ${ALTURA_AR} m de alto`);
