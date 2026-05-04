// _api.mjs — fetch wrapper for the cross.shop game-shop backends.
//
// Each game shop is identified by a slug (rohan2 / seal-m / rom). Its API
// base + per-endpoint paths live in references/games.json. Until Phase-1
// capture has populated the registry, every call here will short-circuit
// via _registry.requireSlot() with `phase_1_not_captured` (exit code 3).
//
// Conventions, mirrored from the sibling skills:
//   - JSON only (Accept: application/json, Content-Type: application/json)
//   - 15s timeout per request
//   - snake_case ↔ camelCase normalization on body+query (toggle via {raw:true})
//   - the bearer/cookie injection shape is per-game and lives in
//     `game.sessionHeader` (registry slot, also Phase-1)

import { getGame, requireSlot } from './_registry.mjs';

const REQUEST_TIMEOUT_MS = 15_000;

// snake_case → camelCase (recursive on objects + arrays)
export function snakeToCamel(input) {
  if (Array.isArray(input)) return input.map(snakeToCamel);
  if (input && typeof input === 'object' && input.constructor === Object) {
    const out = {};
    for (const [k, v] of Object.entries(input)) {
      const ck = k.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
      out[ck] = snakeToCamel(v);
    }
    return out;
  }
  return input;
}

// camelCase → snake_case (recursive)
export function camelToSnake(input) {
  if (Array.isArray(input)) return input.map(camelToSnake);
  if (input && typeof input === 'object' && input.constructor === Object) {
    const out = {};
    for (const [k, v] of Object.entries(input)) {
      const sk = k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
      out[sk] = camelToSnake(v);
    }
    return out;
  }
  return input;
}

function buildQuery(query, { raw = false } = {}) {
  if (!query || Object.keys(query).length === 0) return '';
  const src = raw ? query : camelToSnake(query);
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(src)) {
    if (v === undefined || v === null) continue;
    params.append(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

/**
 * Resolve the API base for a given game. Honors per-game env overrides
 * (CROSS_SHOP_API_BASE_<SLUG_UPPER_SNAKE>) ahead of the registry value.
 * Throws phase_1_not_captured if the registry slot is null AND no env override.
 */
export function gameApiBase(slug) {
  const envKey = `CROSS_SHOP_API_BASE_${String(slug).toUpperCase().replace(/-/g, '_')}`;
  if (process.env[envKey]) return process.env[envKey].replace(/\/$/, '');
  const v = requireSlot(slug, 'apiBase');
  return String(v).replace(/\/$/, '');
}

/**
 * shopFetch(game, key, options)
 *   game     : registry slug (e.g. 'rohan2')
 *   key      : endpoint slot key (e.g. 'productsPath')  — may also be a literal
 *              string starting with '/' for ad-hoc paths
 *   options  : { method, body, query, sessionToken, raw }
 *
 * Always emits structured errors:
 *   - phase_1_not_captured  (exit 3) — slot is null in the registry
 *   - request_timeout       (exit 1)
 *   - http_<status>         (exit 1) — bodyText preserved
 */
export async function shopFetch(game, key, opts = {}) {
  const { method = 'GET', body, query, sessionToken, raw = false } = opts;

  const slug = typeof game === 'string' ? game : game?.slug;
  if (!slug) {
    const err = new Error('shopFetch: game slug required');
    err.code = 'bad_args';
    throw err;
  }

  const base = gameApiBase(slug);
  let pathPart;
  if (typeof key === 'string' && key.startsWith('/')) {
    pathPart = key;
  } else {
    pathPart = String(requireSlot(slug, key));
    if (!pathPart.startsWith('/')) pathPart = `/${pathPart}`;
  }

  const url = `${base}${pathPart}${buildQuery(query, { raw })}`;

  // Session header shape is captured per-game in registry.sessionHeader.
  // Phase-1 typically yields one of:
  //   { kind: "bearer" }                   → Authorization: Bearer <token>
  //   { kind: "cookie", name: "..." }      → Cookie: name=<token>
  //   { kind: "header", name: "..." }      → <name>: <token>
  // We only know the kind once captured; until then any auth-required call
  // will already have failed at requireSlot('sessionHeader').
  const headers = { Accept: 'application/json' };
  if (sessionToken) {
    const game = getGame(slug);
    const sh = game.sessionHeader;
    if (!sh) {
      const err = new Error(`registry slot "${slug}.sessionHeader" not yet captured`);
      err.code = 'phase_1_not_captured';
      err.missing = `${slug}.sessionHeader`;
      err.hint = 'see references/cross-shop.md §3 to capture the auth header shape';
      err.exitCode = 3;
      throw err;
    }
    if (sh.kind === 'bearer') headers.Authorization = `Bearer ${sessionToken}`;
    else if (sh.kind === 'cookie') headers.Cookie = `${sh.name}=${sessionToken}`;
    else if (sh.kind === 'header') headers[sh.name] = sessionToken;
  }

  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(raw ? body : camelToSnake(body));
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method, headers, body: payload, signal: ctrl.signal });
    const text = await res.text();
    let json = null;
    try { json = text.length > 0 ? JSON.parse(text) : null; } catch { /* leave as text */ }
    if (!res.ok) {
      const err = new Error(`${method} ${url} HTTP ${res.status}: ${text.slice(0, 200)}`);
      err.code = `http_${res.status}`;
      err.status = res.status;
      err.bodyText = text;
      throw err;
    }
    return raw ? json : (json !== null ? snakeToCamel(json) : null);
  } catch (err) {
    if (err.name === 'AbortError') {
      const e = new Error(`${method} ${url} timed out after ${REQUEST_TIMEOUT_MS}ms`);
      e.code = 'request_timeout';
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
