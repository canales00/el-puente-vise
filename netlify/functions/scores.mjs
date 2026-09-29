// Récords y torneo de "El Puente — una obra VISE" (Netlify Functions + Netlify Blobs)
//
// Público
//   GET  /api/scores                          -> { scores, torneo }
//   POST /api/scores {name,score,spans,rules} -> { scores, rank, ts, torneo, torneoResultado }
// Administrador (encabezado x-admin-key = variable de entorno ADMIN_KEY)
//   GET    /api/scores?all=1                  -> todo: general, torneo y configuración
//   PUT    /api/scores {torneo:{nombre,inicio,fin}} | {torneo:null}
//   DELETE /api/scores {list:'general'|'torneo', ts} | {list, all:true}
import { getStore } from "@netlify/blobs";

const RULES = "puente-2026-10g"; // debe coincidir con RULES en public/index.html
const KEEP = 50;
const KEEP_TORNEO = 500;
const SHOW = 10;
const MAX_SCORE = 40000;
const MAX_PROG = 14; // 6 tramos de puente + 8 de autopista

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

const adminKey = () => globalThis.Netlify?.env?.get?.("ADMIN_KEY") ?? process.env.ADMIN_KEY ?? "";
function isAdmin(req) {
  const expected = adminKey();
  const given = req.headers.get("x-admin-key") || "";
  if (!expected || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}
const byScore = (a, b) => b.score - a.score || a.ts - b.ts;

function estado(cfg, now = Date.now()) {
  if (!cfg) return null;
  const ini = Date.parse(cfg.inicio), fin = Date.parse(cfg.fin);
  return now < ini ? "proximo" : now <= fin ? "activo" : "terminado";
}
function publicTorneo(cfg, list, limit = SHOW) {
  if (!cfg) return null;
  const e = estado(cfg);
  return { nombre: cfg.nombre, inicio: cfg.inicio, fin: cfg.fin, estado: e, scores: e === "proximo" ? [] : list.slice(0, limit) };
}

export default async (req) => {
  const store = getStore("el-puente-scores");
  const [list, tlist, config] = await Promise.all([
    store.get("top", { type: "json" }).then((v) => v || []),
    store.get("torneo", { type: "json" }).then((v) => v || []),
    store.get("config", { type: "json" }).then((v) => v || {}),
  ]);
  const cfg = config.torneo || null;
  const url = new URL(req.url);
  const adminCall = req.method === "PUT" || req.method === "DELETE" || url.searchParams.get("all") === "1";

  if (adminCall) {
    if (!adminKey()) return json({ error: "Falta configurar ADMIN_KEY en Netlify" }, 503);
    if (!isAdmin(req)) return json({ error: "Clave incorrecta" }, 401);
  }

  if (req.method === "GET") {
    if (adminCall) return json({ scores: list, torneo: publicTorneo(cfg, tlist, KEEP_TORNEO), torneoScores: tlist });
    return json({ scores: list.slice(0, SHOW), torneo: publicTorneo(cfg, tlist) });
  }

  let body;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }

  if (req.method === "PUT") {
    if (body.torneo === null) {
      await store.setJSON("config", { ...config, torneo: null });
      return json({ ok: true, torneo: null });
    }
    const t = body.torneo || {};
    const nombre = String(t.nombre || "").trim().slice(0, 60);
    const ini = Date.parse(t.inicio), fin = Date.parse(t.fin);
    if (!nombre) return json({ error: "Falta el nombre del torneo" }, 400);
    if (!Number.isFinite(ini) || !Number.isFinite(fin) || fin <= ini) return json({ error: "Revisa las fechas: el fin debe ser después del inicio" }, 400);
    const next = { nombre, inicio: new Date(ini).toISOString(), fin: new Date(fin).toISOString() };
    await store.setJSON("config", { ...config, torneo: next });
    return json({ ok: true, torneo: publicTorneo(next, tlist, KEEP_TORNEO) });
  }

  if (req.method === "DELETE") {
    const key = body.list === "torneo" ? "torneo" : "top";
    const src = key === "torneo" ? tlist : list;
    let next;
    if (body.all === true) next = [];
    else if (Number.isInteger(body.ts)) next = src.filter((e) => e.ts !== body.ts);
    else return json({ error: "Indica ts o all" }, 400);
    await store.setJSON(key, next);
    return json({ ok: true, list: key, scores: next, removed: src.length - next.length });
  }

  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const name = String(body.name || "").replace(/[^\p{L}\p{N} ._-]/gu, "").trim().toUpperCase().slice(0, 12);
  const score = Number(body.score);
  const spans = Number(body.spans);
  if (!name) return json({ error: "Falta el nombre" }, 400);
  if (!Number.isInteger(score) || score <= 0 || score > MAX_SCORE) return json({ error: "Puntaje inválido" }, 400);
  if (!Number.isInteger(spans) || spans < 0 || spans > MAX_PROG) return json({ error: "Tramos inválidos" }, 400);

  const ts = Date.now();
  list.push({ name, score, spans, ts });
  list.sort(byScore);
  list.length = Math.min(list.length, KEEP);
  const writes = [store.setJSON("top", list)];
  const rank = list.findIndex((e) => e.ts === ts) + 1;

  // Torneo: solo mientras está activo, con las mismas reglas, y cuenta el mejor puntaje por nombre
  let torneoResultado = null;
  if (estado(cfg) === "activo") {
    if (body.rules !== RULES) {
      torneoResultado = { rechazado: true };
    } else {
      const prev = tlist.find((e) => e.name === name);
      let mejoro = false;
      if (!prev) { tlist.push({ name, score, spans, ts }); mejoro = true; }
      else if (score > prev.score) { Object.assign(prev, { score, spans, ts }); mejoro = true; }
      tlist.sort(byScore);
      tlist.length = Math.min(tlist.length, KEEP_TORNEO);
      if (mejoro) writes.push(store.setJSON("torneo", tlist));
      torneoResultado = { mejoro, rank: tlist.findIndex((e) => e.name === name) + 1 };
    }
  }
  await Promise.all(writes);
  return json({ scores: list.slice(0, SHOW), rank, ts, torneo: publicTorneo(cfg, tlist), torneoResultado });
};

export const config = { path: "/api/scores" };
