// Tabla global de récords para "El Puente — una obra VISE"
// GET  /api/scores  -> { scores: [...top 10] }
// POST /api/scores  { name, score, spans } -> { scores, rank, ts }
import { getStore } from "@netlify/blobs";

const KEEP = 50;        // cuántos récords se guardan
const SHOW = 10;        // cuántos se muestran
const MAX_SCORE = 20000; // tope razonable para descartar puntajes inventados

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export default async (req) => {
  const store = getStore("el-puente-scores");
  const list = (await store.get("top", { type: "json" })) || [];

  if (req.method === "GET") return json({ scores: list.slice(0, SHOW) });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  let body;
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }

  const name = String(body.name || "")
    .replace(/[^\p{L}\p{N} ._-]/gu, "")
    .trim()
    .toUpperCase()
    .slice(0, 12);
  const score = Number(body.score);
  const spans = Number(body.spans);

  if (!name) return json({ error: "Falta el nombre" }, 400);
  if (!Number.isInteger(score) || score <= 0 || score > MAX_SCORE) return json({ error: "Puntaje inválido" }, 400);
  if (!Number.isInteger(spans) || spans < 0 || spans > 6) return json({ error: "Tramos inválidos" }, 400);

  const ts = Date.now();
  list.push({ name, score, spans, ts });
  list.sort((a, b) => b.score - a.score || a.ts - b.ts);
  list.length = Math.min(list.length, KEEP);
  await store.setJSON("top", list);

  const rank = list.findIndex((e) => e.ts === ts) + 1; // 0 si no quedó entre los guardados
  return json({ scores: list.slice(0, SHOW), rank, ts });
};

export const config = { path: "/api/scores" };
