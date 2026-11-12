// Genera personaje.glb: un guerrero low-poly con animación de caminar (pasos reales,
// avanza en círculo). Sin dependencias: node herramientas/generar-personaje.mjs
import { writeFileSync } from 'node:fs';

// ---------- matemáticas ----------
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return mul(a, 1 / l); };
const matVec = (m, p) => [dot(m[0], p), dot(m[1], p), dot(m[2], p)];

// Matriz cuyo eje Y apunta a `dir`
function alignY(dir) {
  const y = norm(dir);
  const helper = Math.abs(y[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const x = norm(cross(helper, y));
  const z = cross(x, y);
  // filas de la matriz: columnas son x, y, z
  return [[x[0], y[0], z[0]], [x[1], y[1], z[1]], [x[2], y[2], z[2]]];
}

const quatAxis = (axis, ang) => { const s = Math.sin(ang / 2); return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(ang / 2)]; };
const quatMul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qX = (a) => quatAxis([1, 0, 0], a);
const qY = (a) => quatAxis([0, 1, 0], a);
const qZ = (a) => quatAxis([0, 0, 1], a);

// ---------- primitivas (triángulos con caras hacia afuera) ----------
function outward(tris) {
  let c = [0, 0, 0], n = 0;
  for (const t of tris) for (const p of t) { c = add(c, p); n++; }
  c = mul(c, 1 / n);
  return tris
    .filter((t) => Math.hypot(...cross(sub(t[1], t[0]), sub(t[2], t[0]))) > 1e-9)
    .map((t) => {
      const nrm = cross(sub(t[1], t[0]), sub(t[2], t[0]));
      const mid = mul(add(add(t[0], t[1]), t[2]), 1 / 3);
      return dot(nrm, sub(mid, c)) < 0 ? [t[0], t[2], t[1]] : t;
    });
}

// tronco de cono a lo largo de Y, de 0 a h
function frustum(rBot, rTop, h, seg = 8) {
  const tris = [];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const b0 = [Math.cos(a0) * rBot, 0, Math.sin(a0) * rBot], b1 = [Math.cos(a1) * rBot, 0, Math.sin(a1) * rBot];
    const t0 = [Math.cos(a0) * rTop, h, Math.sin(a0) * rTop], t1 = [Math.cos(a1) * rTop, h, Math.sin(a1) * rTop];
    tris.push([b0, b1, t1], [b0, t1, t0], [[0, 0, 0], b0, b1], [[0, h, 0], t0, t1]);
  }
  return outward(tris);
}

function ellipsoid(rx, ry, rz, lat = 5, lon = 8) {
  const pt = (i, j) => {
    const th = (i / lat) * Math.PI, ph = (j / lon) * Math.PI * 2;
    return [Math.sin(th) * Math.cos(ph) * rx, Math.cos(th) * ry, Math.sin(th) * Math.sin(ph) * rz];
  };
  const tris = [];
  for (let i = 0; i < lat; i++) for (let j = 0; j < lon; j++) {
    tris.push([pt(i, j), pt(i + 1, j), pt(i + 1, j + 1)], [pt(i, j), pt(i + 1, j + 1), pt(i, j + 1)]);
  }
  return outward(tris);
}

function box(w, h, d) {
  const x = w / 2, y = h / 2, z = d / 2;
  const P = [[-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z], [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]];
  const F = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [3, 2, 6, 7], [0, 3, 7, 4], [1, 2, 6, 5]];
  return outward(F.flatMap(([a, b, c, d]) => [[P[a], P[b], P[c]], [P[a], P[c], P[d]]]));
}

// mover: escala -> matriz de rotación -> traslación
function place(tris, { s = [1, 1, 1], m = null, t = [0, 0, 0] } = {}) {
  return tris.map((tri) => tri.map((p) => {
    let q = [p[0] * s[0], p[1] * s[1], p[2] * s[2]];
    if (m) q = matVec(m, q);
    return add(q, t);
  }));
}

// tronco de cono entre dos puntos
function between(a, b, rA, rB, seg = 8) {
  const d = sub(b, a);
  return place(frustum(rA, rB, Math.hypot(...d), seg), { m: alignY(d), t: a });
}

// ---------- materiales ----------
const MATS = {
  piel: [0.95, 0.74, 0.58],
  naranja: [0.95, 0.45, 0.08],
  azul: [0.12, 0.28, 0.66],
  cinturon: [0.25, 0.22, 0.6],
  pelo: [1.0, 0.85, 0.25],
  ojos: [0.08, 0.08, 0.1],
  rojo: [0.75, 0.18, 0.15],
};
const MAT_NAMES = Object.keys(MATS);

// ---------- partes del cuerpo (cada nodo: { material: triángulos[] }) ----------
const parts = {};
const put = (node, mat, tris) => { (parts[node] ??= {})[mat] ??= []; parts[node][mat].push(...tris); };

const THIGH = 0.29, SHIN_TO_SOLE = 0.325, LEG_X = 0.09, LEG_Y = -0.03;

// Torso (hijo de la cadera)
put('Torso', 'naranja', place(frustum(0.15, 0.14, 0.1), { t: [0, -0.08, 0] }));
put('Torso', 'cinturon', place(frustum(0.145, 0.15, 0.06), { s: [1, 1, 0.8], t: [0, 0.0, 0] }));
put('Torso', 'naranja', place(frustum(0.13, 0.2, 0.3, 8), { s: [1, 1, 0.68], t: [0, 0.05, 0] }));
put('Torso', 'azul', place(frustum(0.08, 0.075, 0.05), { t: [0, 0.34, 0] }));
put('Torso', 'piel', place(box(0.1, 0.08, 0.02), { m: alignY([0, 1, 0.3]), t: [0, 0.3, 0.088] }));
put('Torso', 'piel', place(frustum(0.05, 0.048, 0.1), { t: [0, 0.36, 0] }));

// Cabeza
put('Cabeza', 'piel', place(ellipsoid(0.095, 0.115, 0.1, 6, 10), { t: [0, 0.11, 0.01] }));
put('Cabeza', 'piel', place(ellipsoid(0.02, 0.03, 0.02), { t: [0.095, 0.11, 0] }));
put('Cabeza', 'piel', place(ellipsoid(0.02, 0.03, 0.02), { t: [-0.095, 0.11, 0] }));
put('Cabeza', 'ojos', place(box(0.036, 0.02, 0.014), { m: alignY([0.25, 1, 0]), t: [0.036, 0.12, 0.1] }));
put('Cabeza', 'ojos', place(box(0.036, 0.02, 0.014), { m: alignY([-0.25, 1, 0]), t: [-0.036, 0.12, 0.1] }));
put('Cabeza', 'pelo', place(box(0.035, 0.01, 0.012), { m: alignY([-0.6, 1, 0]), t: [0.037, 0.142, 0.1] }));
put('Cabeza', 'pelo', place(box(0.035, 0.01, 0.012), { m: alignY([0.6, 1, 0]), t: [-0.037, 0.142, 0.1] }));
const HAIR_C = [0, 0.165, -0.015];
put('Cabeza', 'pelo', place(ellipsoid(0.105, 0.09, 0.105, 5, 8), { t: HAIR_C }));
const spikes = [
  [[0, 1, -0.15], 0.22], [[0.45, 0.9, -0.25], 0.2], [[-0.45, 0.9, -0.25], 0.2],
  [[0.9, 0.55, -0.15], 0.17], [[-0.9, 0.55, -0.15], 0.17], [[0.3, 0.6, -0.8], 0.19],
  [[-0.3, 0.6, -0.8], 0.19], [[0, 0.35, -1], 0.17], [[0.75, 0.15, -0.6], 0.14],
  [[-0.75, 0.15, -0.6], 0.14], [[0.2, 1, 0.3], 0.16], [[-0.2, 1, 0.3], 0.16],
];
for (const [dir, len] of spikes) {
  const d = norm(dir), base = add(HAIR_C, mul(d, 0.06));
  put('Cabeza', 'pelo', between(base, add(base, mul(d, len)), 0.045, 0, 5));
}
for (const [x, dx] of [[0.04, 0.35], [-0.04, -0.35], [0, 0.05]]) {
  const base = [x, 0.215, 0.07];
  put('Cabeza', 'pelo', between(base, add(base, mul(norm([dx, -0.7, 0.55]), 0.09)), 0.025, 0, 5));
}

// Brazos
for (const side of ['I', 'D']) {
  put('Hombro' + side, 'piel', ellipsoid(0.068, 0.065, 0.065));
  put('Hombro' + side, 'piel', between([0, 0, 0], [0, -0.24, 0], 0.058, 0.046));
  put('Codo' + side, 'piel', between([0, 0, 0], [0, -0.16, 0], 0.046, 0.04));
  put('Codo' + side, 'azul', between([0, -0.14, 0], [0, -0.2, 0], 0.05, 0.05));
  put('Codo' + side, 'piel', place(ellipsoid(0.045, 0.05, 0.045), { t: [0, -0.24, 0] }));
}

// Piernas (pantalón holgado, botas azules con borde rojo)
for (const side of ['I', 'D']) {
  put('Pierna' + side, 'naranja', between([0, 0.02, 0], [0, -THIGH, 0], 0.088, 0.072));
  put('Rodilla' + side, 'naranja', between([0, 0, 0], [0, -0.18, 0], 0.072, 0.075));
  put('Rodilla' + side, 'rojo', between([0, -0.17, 0], [0, -0.185, 0], 0.062, 0.062));
  put('Rodilla' + side, 'azul', between([0, -0.18, 0], [0, -0.29, 0], 0.056, 0.052));
  put('Rodilla' + side, 'azul', place(box(0.085, 0.05, 0.16), { t: [0, -SHIN_TO_SOLE + 0.025, 0.03] }));
}

// ---------- jerarquía ----------
const HIP_REST = THIGH + SHIN_TO_SOLE - LEG_Y;
const SHOULDER_TILT = 0.14;
const hierarchy = {
  name: 'Personaje', children: [{
    name: 'Cadera', t: [0, HIP_REST, 0], children: [
      { name: 'Torso', children: [
        { name: 'Cabeza', t: [0, 0.45, 0] },
        { name: 'HombroI', t: [0.21, 0.33, 0], children: [{ name: 'CodoI', t: [0, -0.24, 0] }] },
        { name: 'HombroD', t: [-0.21, 0.33, 0], children: [{ name: 'CodoD', t: [0, -0.24, 0] }] },
      ] },
      { name: 'PiernaI', t: [LEG_X, LEG_Y, 0], children: [{ name: 'RodillaI', t: [0, -THIGH, 0] }] },
      { name: 'PiernaD', t: [-LEG_X, LEG_Y, 0], children: [{ name: 'RodillaD', t: [0, -THIGH, 0] }] },
    ],
  }],
};

// ---------- animación de caminar ----------
const CYCLE = 1.1;         // segundos por ciclo (2 pasos)
const CYCLES = 6;          // ciclos por vuelta completa
const DURATION = CYCLE * CYCLES;
const FPS = 24;
const LEG_SWING = 0.38, ARM_SWING = 0.45;
const stride = 2 * (THIGH + SHIN_TO_SOLE) * Math.sin(LEG_SWING); // avance por paso
const RADIUS = (stride * 2 * CYCLES) / (Math.PI * 2);

const times = [];
for (let i = 0; i <= DURATION * FPS; i++) times.push(i / FPS);

const tracks = {}; // "nodo/path" -> valores[]
const key = (node, path, val) => (tracks[`${node}/${path}`] ??= []).push(...val);

for (const t of times) {
  const ph = (t / CYCLE) * Math.PI * 2;
  const s = Math.sin(ph), c = Math.cos(ph);

  // piernas: ángulo negativo = adelante; la rodilla se dobla al balancear
  const aI = -LEG_SWING * s, aD = LEG_SWING * s;
  const kI = 0.08 + 0.85 * Math.max(0, c) ** 1.5, kD = 0.08 + 0.85 * Math.max(0, -c) ** 1.5;
  key('PiernaI', 'rotation', qX(aI)); key('RodillaI', 'rotation', qX(kI));
  key('PiernaD', 'rotation', qX(aD)); key('RodillaD', 'rotation', qX(kD));

  // la cadera sube/baja para que el pie de apoyo toque el piso
  const footY = (a, k) => LEG_Y - (THIGH * Math.cos(a) + SHIN_TO_SOLE * Math.cos(a + k));
  const hipY = -Math.min(footY(aI, kI), footY(aD, kD));
  key('Cadera', 'translation', [0, hipY, 0]);
  key('Cadera', 'rotation', qY(-0.06 * s));
  key('Torso', 'rotation', quatMul(qY(0.16 * s), qX(0.07)));
  key('Cabeza', 'rotation', quatMul(qY(-0.1 * s), qX(-0.05)));

  // brazos opuestos a las piernas
  key('HombroI', 'rotation', quatMul(qZ(SHOULDER_TILT), qX(ARM_SWING * s)));
  key('HombroD', 'rotation', quatMul(qZ(-SHOULDER_TILT), qX(-ARM_SWING * s)));
  key('CodoI', 'rotation', qX(-0.35 - 0.3 * Math.max(0, -s)));
  key('CodoD', 'rotation', qX(-0.35 - 0.3 * Math.max(0, s)));

  // avanza en círculo alrededor del punto donde se colocó
  const yaw = (t / DURATION) * Math.PI * 2;
  key('Personaje', 'translation', [-RADIUS * Math.cos(yaw), 0, RADIUS * Math.sin(yaw)]);
  key('Personaje', 'rotation', qY(yaw));
}

// ---------- escritor GLB ----------
const chunks = []; let byteLength = 0;
const gltf = {
  asset: { version: '2.0', generator: 'generar-personaje.mjs' },
  scene: 0, scenes: [{ nodes: [0] }], nodes: [], meshes: [], accessors: [], bufferViews: [],
  materials: MAT_NAMES.map((n) => ({
    name: n, pbrMetallicRoughness: { baseColorFactor: [...MATS[n], 1], metallicFactor: 0, roughnessFactor: 0.75 },
  })),
  animations: [], buffers: [],
};

function accessor(values, type, extra = {}) {
  const arr = new Float32Array(values);
  const buf = Buffer.from(arr.buffer);
  const pad = (4 - (buf.length % 4)) % 4;
  gltf.bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: buf.length, ...(extra.target ? { target: extra.target } : {}) });
  chunks.push(buf, Buffer.alloc(pad)); byteLength += buf.length + pad;
  const comps = { SCALAR: 1, VEC3: 3, VEC4: 4 }[type];
  const acc = { bufferView: gltf.bufferViews.length - 1, componentType: 5126, count: arr.length / comps, type };
  if (extra.minmax) {
    acc.min = Array(comps).fill(Infinity); acc.max = Array(comps).fill(-Infinity);
    for (let i = 0; i < arr.length; i++) {
      acc.min[i % comps] = Math.min(acc.min[i % comps], arr[i]);
      acc.max[i % comps] = Math.max(acc.max[i % comps], arr[i]);
    }
  }
  gltf.accessors.push(acc);
  return gltf.accessors.length - 1;
}

function meshFor(name) {
  const p = parts[name];
  if (!p) return undefined;
  const primitives = Object.entries(p).map(([mat, tris]) => {
    const pos = [], nor = [];
    for (const tri of tris) {
      const n = norm(cross(sub(tri[1], tri[0]), sub(tri[2], tri[0])));
      for (const v of tri) { pos.push(...v); nor.push(...n); }
    }
    return {
      attributes: { POSITION: accessor(pos, 'VEC3', { minmax: true, target: 34962 }), NORMAL: accessor(nor, 'VEC3', { target: 34962 }) },
      material: MAT_NAMES.indexOf(mat), mode: 4,
    };
  });
  gltf.meshes.push({ name, primitives });
  return gltf.meshes.length - 1;
}

const nodeIndex = {};
function addNode(def) {
  const idx = gltf.nodes.length;
  const node = { name: def.name };
  gltf.nodes.push(node); nodeIndex[def.name] = idx;
  if (def.t) node.translation = def.t;
  const mesh = meshFor(def.name);
  if (mesh !== undefined) node.mesh = mesh;
  if (def.children) node.children = def.children.map(addNode);
  return idx;
}
addNode(hierarchy);

const input = accessor(times, 'SCALAR', { minmax: true });
const anim = { name: 'Caminar', samplers: [], channels: [] };
for (const [k, vals] of Object.entries(tracks)) {
  const [node, path] = k.split('/');
  anim.samplers.push({ input, output: accessor(vals, path === 'rotation' ? 'VEC4' : 'VEC3'), interpolation: 'LINEAR' });
  anim.channels.push({ sampler: anim.samplers.length - 1, target: { node: nodeIndex[node], path } });
}
gltf.animations.push(anim);

const bin = Buffer.concat(chunks);
gltf.buffers.push({ byteLength: bin.length });
let json = Buffer.from(JSON.stringify(gltf));
json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
const chunkHead = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(type, 4); return b; };
const out = Buffer.concat([header, chunkHead(json.length, 0x4e4f534a), json, chunkHead(bin.length, 0x004e4942), bin]);

const file = new URL('../personaje.glb', import.meta.url);
writeFileSync(file, out);
const triCount = Object.values(parts).flatMap((p) => Object.values(p)).reduce((n, t) => n + t.length, 0);
console.log(`personaje.glb: ${(out.length / 1024).toFixed(0)} KB, ${triCount} triángulos, radio de caminata ${RADIUS.toFixed(2)} m`);
