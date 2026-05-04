#!/usr/bin/env node
// orders.mjs — fetch the user's purchase history for a given game shop.
//
// SKELETON (v0.1-rc-skeleton): short-circuits with phase_1_not_captured
// (exit 3) until `ordersPath` (+ `sessionHeader`) is populated in
// references/games.json for the requested game.
//
// Usage:
//   node scripts/orders.mjs <game> [--limit N]
//
// Auth: requires a persisted session (login.mjs --persist) or an in-memory
// session token piped from a chained call. Skeleton checks registry first.

import 'dotenv/config';
import { getGame } from './_registry.mjs';
import { shopFetch } from './_api.mjs';
import { loadSession } from './_session.mjs';

function parseArgs(argv) {
  const out = { game: null, limit: 25 };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit') out.limit = Number(argv[++i]);
    else if (a.startsWith('--limit=')) out.limit = Number(a.slice('--limit='.length));
    else positional.push(a);
  }
  if (positional.length > 0) out.game = positional[0];
  return out;
}

const args = parseArgs(process.argv.slice(2));
const parsedIntent = { command: 'orders', game: args.game ?? null, limit: args.limit };

function emit(envelope) {
  process.stdout.write(JSON.stringify({ ...envelope, ts: new Date().toISOString() }));
}

async function main() {
  if (!args.game) {
    const err = new Error('usage: orders.mjs <game> [--limit N]');
    err.code = 'bad_args';
    err.exitCode = 2;
    throw err;
  }
  const game = getGame(args.game);
  parsedIntent.gameDisplayName = game.displayName;

  const session = loadSession(args.game);
  if (!session?.token) {
    const err = new Error(`no persisted session for "${args.game}"; run login.mjs first with --persist`);
    err.code = 'missing_session';
    err.exitCode = 2;
    throw err;
  }

  // Will throw phase_1_not_captured on the skeleton build.
  const resp = await shopFetch(args.game, 'ordersPath', {
    method: 'GET',
    query: { limit: args.limit },
    sessionToken: session.token,
  });

  emit({
    ok: true,
    parsedIntent,
    orders: Array.isArray(resp) ? resp : (resp?.orders ?? resp?.data ?? resp ?? []),
    raw: resp,
    signerWarn: null,
  });
}

main().catch((err) => {
  if (process.env.DEBUG) process.stderr.write(String(err?.stack || err) + '\n');
  emit({
    ok: false,
    parsedIntent,
    error: err?.code || 'unknown_error',
    message: err?.message || String(err),
    missing: err?.missing ?? null,
    hint: err?.hint ?? null,
    signerWarn: null,
  });
  process.exit(err?.exitCode ?? 1);
});
