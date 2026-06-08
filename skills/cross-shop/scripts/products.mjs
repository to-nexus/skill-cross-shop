#!/usr/bin/env node
// products.mjs — fetch the product catalog for a given game shop.
//
// SKELETON (v0.1-rc-skeleton): this script short-circuits with
//   {ok:false, error:"phase_1_not_captured", missing:"<slug>.productsPath", hint:"..."}
// (exit 3) until references/games.json has the productsPath slot populated
// for the requested game. See references/cross-shop.md §4 for the capture
// playbook.
//
// Once populated, the implementation will:
//   1. shopFetch(slug, 'productsPath') — anonymous (or session if registry
//      says so); the live frontend exposes the catalog without auth on
//      the rohan2 SSR landing page, so v0.1 anticipates anonymous reads.
//   2. Normalize each row into:
//        { productId, name, priceUsd, priceCROSS, priceBNB, image, category,
//          weeklyCapRemaining? }
//   3. Emit one JSON envelope.

import 'dotenv/config';
import { getGame } from './_registry.mjs';
import { shopFetch } from './_api.mjs';

const argv = process.argv.slice(2);
const [gameArg] = argv;
const parsedIntent = { command: 'products', game: gameArg ?? null };

function emit(envelope) {
  process.stdout.write(JSON.stringify({ ...envelope, ts: new Date().toISOString() }));
}

async function main() {
  if (!gameArg) {
    const err = new Error('usage: products.mjs <game>  (game slug: rohan2 | seal-m | rom)');
    err.code = 'bad_args';
    err.exitCode = 2;
    throw err;
  }
  // Will throw `unknown_game` if slug not in registry.
  const game = getGame(gameArg);
  parsedIntent.gameDisplayName = game.displayName;

  // Will throw `phase_1_not_captured` (exit 3) until the slot is populated.
  const data = await shopFetch(gameArg, 'productsPath');

  // Once Phase 1 is captured, replace this passthrough with normalization.
  emit({
    ok: true,
    parsedIntent,
    products: Array.isArray(data) ? data : (data?.products ?? data?.data ?? data ?? []),
    raw: data,
    signerWarn: null,
  });
}

main().catch((err) => {
  if (process.env.DEBUG) process.stderr.write(String(err?.message || err) + '\n');
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
