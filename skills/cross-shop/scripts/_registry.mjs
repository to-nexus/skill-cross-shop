// _registry.mjs — load the per-game adapter registry from
// references/games.json and expose a safe accessor that:
//   - validates the game slug
//   - exposes the per-game endpoint set
//   - tells the caller which slot is missing (`phase_1_not_captured`)
//     so stub scripts can emit a useful structured error.
//
// The registry is data, not code: adding a new game subdomain MUST NOT
// require touching scripts/. See REQUIREMENTS NFR-07.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REGISTRY_PATH = path.resolve(__dirname, '..', 'references', 'games.json');

let _cache = null;

export function loadRegistry() {
  if (_cache !== null) return _cache;
  const raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
  const json = JSON.parse(raw);
  if (!json || typeof json !== 'object' || !json.games) {
    const err = new Error('references/games.json missing top-level "games" key');
    err.code = 'bad_registry';
    throw err;
  }
  _cache = json;
  return _cache;
}

export function listGameSlugs() {
  const reg = loadRegistry();
  return Object.keys(reg.games);
}

export function listGames() {
  const reg = loadRegistry();
  return Object.entries(reg.games).map(([slug, game]) => ({ ...game, slug }));
}

export function getGame(slug) {
  const reg = loadRegistry();
  const game = reg.games?.[slug];
  if (!game) {
    const err = new Error(
      `unknown game "${slug}" (known: ${listGameSlugs().join(', ')})`
    );
    err.code = 'unknown_game';
    err.exitCode = 2;
    throw err;
  }
  return { ...game, slug };
}

/**
 * Assert the registry slot at <slug>.<key> is non-null. Throws a structured
 * error with code `phase_1_not_captured` if the slot is null/empty —
 * stub scripts use this to short-circuit cleanly.
 *
 * Example:  requireSlot('rohan2', 'loginPath')
 */
export function requireSlot(slug, key) {
  const game = getGame(slug);
  const v = game[key];
  if (v === null || v === undefined || v === '') {
    const err = new Error(
      `registry slot "${slug}.${key}" not yet captured — see references/cross-shop.md to populate it via DevTools`
    );
    err.code = 'phase_1_not_captured';
    err.missing = `${slug}.${key}`;
    err.hint = 'see the maintainer-only endpoint discovery notes in references/cross-shop.md';
    err.exitCode = 3;
    throw err;
  }
  return v;
}

export function registryVersion() {
  const reg = loadRegistry();
  return reg.version ?? null;
}
