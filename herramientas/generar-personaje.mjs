// Genera personaje.glb: un guerrero estilo anime con animación de caminar (pasos reales,
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
  return [[x[0], y[0], z[0]], [x[1], y[1], z[1]], [x[2], y[2], z[2]]];
}
const rotZ = (a) => [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]];

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
    .filter((t) => Math.hypot(...cross(sub(t[1], t[0]), sub(t[2], t[0]))) > 1e-10)
    .map((t) => {
      const nrm = cross(sub(t[1], t[0]), sub(t[2], t[0]));
      const mid = mul(add(add(t[0], t[1]), t[2]), 1 / 3);
      return dot(nrm, sub(mid, c)) < 0 ? [t[0], t[2], t[1]] : t;
    });
}

// tronco de cono a lo largo de Y, de 0 a h
function frustum(rBot, rTop, h, seg = 10) {
  const tris = [];
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
    const b0 = [Math.cos(a0) * rBot, 0, Math.sin(a0) * rBot], b1 = [Math.cos(a1) * rBot, 0, Math.sin(a1) * rBot];
    const t0 = [Math.cos(a0) * rTop, h, Math.sin(a0) * rTop], t1 = [Math.cos(a1) * rTop, h, Math.sin(a1) * rTop];
    tris.push([b0, b1, t1], [b0, t1, t0], [[0, 0, 0], b0, b1], [[0, h, 0], t0, t1]);
  }
  return outward(tris);
}

function ellipsoid(rx, ry, rz, lat = 6, lon = 10) {
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
function between(a, b, rA, rB, seg = 10) {
  const d = sub(b, a);
  return place(frustum(rA, rB, Math.hypot(...d), seg), { m: alignY(d), t: a });
}

// ---------- materiales (colores sRGB; glTF los quiere lineales) ----------
const hex = (h) => [0, 2, 4].map((i) => {
  const c = parseInt(h.slice(i + 1, i + 3), 16) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});
const MATS = {
  piel: ['#f7c39a', 0.65],
  naranja: ['#ff7410', 0.8],
  azul: ['#1e4cc0', 0.75],
  faja: ['#4b33b0', 0.75],
  pelo: ['#ffd02a', 0.45],
  ceja: ['#d9a417', 0.6],
  blanco: ['#ffffff', 0.4],
  pupila: ['#1fa39a', 0.3],
  oscuro: ['#2a1612', 0.7],
  rojo: ['#d0281a', 0.7],
};
const MAT_NAMES = Object.keys(MATS);

// ---------- partes del cuerpo ----------
// Cada primitiva calcula sus normales: suaves en superficies curvas, marcadas en bordes > 50°.
const parts = {}; // nodo -> material -> { pos[], nor[] }
const CREASE = Math.cos((50 * Math.PI) / 180);
function put(node, mat, tris) {
  const faceN = tris.map((t) => norm(cross(sub(t[1], t[0]), sub(t[2], t[0]))));
  const k = (p) => p.map((v) => v.toFixed(5)).join(',');
  const byPos = new Map();
  tris.forEach((t, i) => t.forEach((p) => { const key = k(p); if (!byPos.has(key)) byPos.set(key, []); byPos.get(key).push(i); }));
  const dst = ((parts[node] ??= {})[mat] ??= { pos: [], nor: [] });
  tris.forEach((t, i) => t.forEach((p) => {
    let n = [0, 0, 0];
    for (const j of byPos.get(k(p))) if (dot(faceN[j], faceN[i]) > CREASE) n = add(n, faceN[j]);
    dst.pos.push(p); dst.nor.push(norm(n));
  }));
}

// Medidas del cuerpo (unidades de cuerpo; el nodo "Modelo" lo escala a tamaño real)
const BODY_SCALE = 0.75;
const THIGH = 0.44, SHIN_TO_SOLE = 0.48, LEG_X = 0.11, LEG_Y = -0.05;

// --- Torso (hijo de la cadera) ---
// pantalón y restos del gi colgando sobre la faja
put('Torso', 'naranja', place(frustum(0.17, 0.165, 0.16), { s: [1, 1, 0.82], t: [0, -0.12, 0] }));
put('Torso', 'naranja', place(frustum(0.205, 0.175, 0.13), { s: [1, 1, 0.85], t: [0, -0.06, 0] }));
for (let i = 0; i < 9; i++) {
  const a = (i / 9) * Math.PI * 2 + 0.3, r = 0.19;
  const base = [Math.cos(a) * r, 0.0, Math.sin(a) * r * 0.85];
  put('Torso', 'naranja', between(base, add(base, [Math.cos(a) * 0.03, -0.09 - (i % 3) * 0.025, Math.sin(a) * 0.03]), 0.035, 0, 4));
}
put('Torso', 'faja', place(frustum(0.18, 0.172, 0.08), { s: [1, 1, 0.82], t: [0, 0.05, 0] }));
// abdomen, pecho y abdominales
put('Torso', 'piel', place(frustum(0.155, 0.185, 0.24), { s: [1, 1, 0.74], t: [0, 0.1, 0] }));
put('Torso', 'piel', place(ellipsoid(0.26, 0.17, 0.15), { t: [0, 0.4, -0.01] }));
for (const x of [0.09, -0.09]) put('Torso', 'piel', place(ellipsoid(0.105, 0.075, 0.06), { t: [x, 0.41, 0.09] }));
for (const y of [0.17, 0.23, 0.29]) for (const x of [0.045, -0.045]) {
  put('Torso', 'piel', place(ellipsoid(0.04, 0.028, 0.025, 4, 6), { t: [x, y, 0.118 + (y - 0.17) * 0.12] }));
}
// trapecios y cuello
put('Torso', 'piel', place(ellipsoid(0.18, 0.065, 0.09), { t: [0, 0.53, -0.025] }));
put('Torso', 'piel', place(frustum(0.078, 0.068, 0.13), { t: [0, 0.5, 0] }));
// camiseta azul rota: tira diagonal al frente y espalda
put('Torso', 'azul', place(box(0.11, 0.48, 0.035), { m: rotZ(0.72), t: [-0.03, 0.33, 0.14] }));
put('Torso', 'azul', place(box(0.36, 0.36, 0.04), { t: [0, 0.34, -0.135] }));
put('Torso', 'azul', place(box(0.13, 0.12, 0.2), { m: rotZ(-0.4), t: [-0.2, 0.5, 0] }));

// --- Cabeza ---
put('Cabeza', 'piel', place(ellipsoid(0.085, 0.1, 0.092), { t: [0, 0.14, 0] }));
put('Cabeza', 'piel', place(ellipsoid(0.068, 0.07, 0.075), { t: [0, 0.075, 0.022] }));
for (const x of [0.084, -0.084]) put('Cabeza', 'piel', place(ellipsoid(0.016, 0.028, 0.02, 4, 6), { t: [x, 0.12, 0] }));
put('Cabeza', 'piel', between([0, 0.115, 0.085], [0, 0.098, 0.108], 0.012, 0.002, 4));
for (const sx of [1, -1]) {
  put('Cabeza', 'blanco', place(box(0.036, 0.017, 0.012), { m: rotZ(sx * 0.18), t: [sx * 0.034, 0.128, 0.083] }));
  put('Cabeza', 'pupila', place(box(0.012, 0.015, 0.012), { t: [sx * 0.028, 0.127, 0.088] }));
  put('Cabeza', 'ceja', place(box(0.042, 0.011, 0.016), { m: rotZ(sx * 0.32), t: [sx * 0.036, 0.15, 0.084] }));
}
put('Cabeza', 'oscuro', place(box(0.028, 0.005, 0.01), { t: [0, 0.063, 0.093] }));
// pelo en picos (super guerrero dorado)
const HAIR_C = [0, 0.16, -0.012];
put('Cabeza', 'pelo', place(ellipsoid(0.096, 0.085, 0.1, 5, 8), { t: HAIR_C }));
const spikes = [
  [[0, 1, -0.15], 0.32, 0.06], [[0.35, 1, -0.2], 0.29, 0.055], [[-0.35, 1, -0.2], 0.29, 0.055],
  [[0.75, 0.8, -0.25], 0.25, 0.05], [[-0.75, 0.8, -0.25], 0.25, 0.05],
  [[1, 0.35, -0.15], 0.2, 0.045], [[-1, 0.35, -0.15], 0.2, 0.045],
  [[0.3, 0.75, -0.8], 0.26, 0.055], [[-0.3, 0.75, -0.8], 0.26, 0.055], [[0, 0.45, -1], 0.24, 0.055],
  [[0.65, 0.25, -0.8], 0.19, 0.045], [[-0.65, 0.25, -0.8], 0.19, 0.045],
  [[0.15, 1, 0.3], 0.22, 0.05], [[-0.18, 1, 0.25], 0.2, 0.05],
];
for (const [dir, len, r] of spikes) {
  const d = norm(dir), base = add(HAIR_C, mul(d, 0.065));
  put('Cabeza', 'pelo', between(base, add(base, mul(d, len)), r, 0, 5));
}
// mechones sobre la frente y patillas
for (const [x, dx, len] of [[0.06, 0.5, 0.065], [0.02, 0.15, 0.075], [-0.025, -0.2, 0.07], [-0.06, -0.55, 0.06]]) {
  const base = [x, 0.225, 0.07];
  put('Cabeza', 'pelo', between(base, add(base, mul(norm([dx, -0.6, 0.75]), len)), 0.026, 0, 5));
}
for (const sx of [1, -1]) put('Cabeza', 'pelo', between([sx * 0.08, 0.17, 0.03], [sx * 0.092, 0.1, 0.035], 0.022, 0, 4));

// --- Brazos ---
for (const side of ['I', 'D']) {
  put('Hombro' + side, 'piel', ellipsoid(0.088, 0.085, 0.085));
  put('Hombro' + side, 'piel', place(ellipsoid(0.074, 0.19, 0.078, 7, 10), { t: [0, -0.15, 0.008] }));
  put('Codo' + side, 'piel', place(ellipsoid(0.06, 0.16, 0.06, 7, 10), { t: [0, -0.1, 0.005] }));
  put('Codo' + side, 'azul', between([0, -0.19, 0], [0, -0.27, 0], 0.056, 0.056));
  put('Codo' + side, 'piel', place(ellipsoid(0.05, 0.055, 0.056), { t: [0, -0.31, 0.005] }));
}

// --- Piernas: pantalón holgado, botas azules con borde rojo ---
for (const side of ['I', 'D']) {
  put('Pierna' + side, 'naranja', place(ellipsoid(0.115, 0.27, 0.118, 7, 10), { t: [0, -0.2, 0.005] }));
  put('Rodilla' + side, 'naranja', place(ellipsoid(0.1, 0.2, 0.104, 7, 10), { t: [0, -0.15, 0] }));
  put('Rodilla' + side, 'rojo', between([0, -0.29, 0], [0, -0.31, 0], 0.08, 0.08));
  put('Rodilla' + side, 'azul', between([0, -0.3, 0], [0, -0.44, 0], 0.072, 0.066));
  put('Rodilla' + side, 'rojo', place(box(0.012, 0.14, 0.012), { t: [0, -0.37, 0.07] }));
  put('Rodilla' + side, 'azul', place(box(0.11, 0.06, 0.2), { t: [0, -SHIN_TO_SOLE + 0.03, 0.035] }));
  put('Rodilla' + side, 'azul', place(ellipsoid(0.055, 0.035, 0.06, 4, 8), { t: [0, -SHIN_TO_SOLE + 0.035, 0.13] }));
}

// ---------- jerarquía ----------
const HIP_REST = THIGH + SHIN_TO_SOLE - LEG_Y;
const SHOULDER_TILT = 0.13;
const hierarchy = {
  name: 'Personaje', children: [{
    name: 'Modelo', s: [BODY_SCALE, BODY_SCALE, BODY_SCALE], children: [{
      name: 'Cadera', t: [0, HIP_REST, 0], children: [
        { name: 'Torso', children: [
          { name: 'Cabeza', t: [0, 0.6, 0.01] },
          { name: 'HombroI', t: [0.27, 0.48, 0], children: [{ name: 'CodoI', t: [0, -0.3, 0] }] },
          { name: 'HombroD', t: [-0.27, 0.48, 0], children: [{ name: 'CodoD', t: [0, -0.3, 0] }] },
        ] },
        { name: 'PiernaI', t: [LEG_X, LEG_Y, 0], children: [{ name: 'RodillaI', t: [0, -THIGH, 0] }] },
        { name: 'PiernaD', t: [-LEG_X, LEG_Y, 0], children: [{ name: 'RodillaD', t: [0, -THIGH, 0] }] },
      ],
    }],
  }],
};

// ---------- animación de caminar ----------
const CYCLE = 1.1;         // segundos por ciclo (2 pasos)
const CYCLES = 4;          // ciclos por vuelta completa
const DURATION = CYCLE * CYCLES;
const FPS = 20;
const LEG_SWING = 0.32, ARM_SWING = 0.4;
const stride = 2 * (THIGH + SHIN_TO_SOLE) * Math.sin(LEG_SWING) * BODY_SCALE; // metros por paso
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
  key('Torso', 'rotation', quatMul(qY(0.14 * s), qX(0.06)));
  key('Cabeza', 'rotation', quatMul(qY(-0.09 * s), qX(-0.04)));

  // brazos opuestos a las piernas, puños cerrados
  key('HombroI', 'rotation', quatMul(qZ(SHOULDER_TILT), qX(ARM_SWING * s)));
  key('HombroD', 'rotation', quatMul(qZ(-SHOULDER_TILT), qX(-ARM_SWING * s)));
  key('CodoI', 'rotation', qX(-0.3 - 0.35 * Math.max(0, -s)));
  key('CodoD', 'rotation', qX(-0.3 - 0.35 * Math.max(0, s)));

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
    name: n, pbrMetallicRoughness: { baseColorFactor: [...hex(MATS[n][0]), 1], metallicFactor: 0, roughnessFactor: MATS[n][1] },
  })),
  animations: [], buffers: [],
};

function accessor(values, type, extra = {}) {
  const arr = extra.indices ? new Uint16Array(values) : new Float32Array(values);
  const buf = Buffer.from(arr.buffer);
  const pad = (4 - (buf.length % 4)) % 4;
  gltf.bufferViews.push({ buffer: 0, byteOffset: byteLength, byteLength: buf.length, ...(extra.target ? { target: extra.target } : {}) });
  chunks.push(buf, Buffer.alloc(pad)); byteLength += buf.length + pad;
  const comps = { SCALAR: 1, VEC3: 3, VEC4: 4 }[type];
  const acc = { bufferView: gltf.bufferViews.length - 1, componentType: extra.indices ? 5123 : 5126, count: arr.length / comps, type };
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

let triTotal = 0;
function meshFor(name) {
  const p = parts[name];
  if (!p) return undefined;
  const primitives = Object.entries(p).map(([mat, { pos, nor }]) => {
    // vértices compartidos (posición + normal iguales) -> geometría indexada
    const map = new Map(), P = [], N = [], idx = [];
    pos.forEach((v, i) => {
      const key = [...v, ...nor[i]].map((x) => x.toFixed(5)).join(',');
      if (!map.has(key)) { map.set(key, P.length / 3); P.push(...v); N.push(...nor[i]); }
      idx.push(map.get(key));
    });
    triTotal += idx.length / 3;
    return {
      attributes: { POSITION: accessor(P, 'VEC3', { minmax: true, target: 34962 }), NORMAL: accessor(N, 'VEC3', { target: 34962 }) },
      indices: accessor(idx, 'SCALAR', { indices: true, target: 34963 }),
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
  if (def.s) node.scale = def.s;
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
console.log(`personaje.glb: ${(out.length / 1024).toFixed(0)} KB, ${triTotal} triángulos, radio de caminata ${RADIUS.toFixed(2)} m`);
