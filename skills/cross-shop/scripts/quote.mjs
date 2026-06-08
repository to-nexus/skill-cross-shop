#!/usr/bin/env node
// quote.mjs — build a cross.shop purchase quote without signing.
//
// SKELETON (v0.1-rc-skeleton): short-circuits with phase_1_not_captured
// (exit 3) until `quotePath` (and the underlying `productsPath`) is
// populated in references/games.json for the requested game and rail.
// See references/cross-shop.md §5 for the capture playbook.
//
// Usage:
//   node scripts/quote.mjs <game> <productId> --pay <CROSS|BNB>
//
// Output (post-Phase-1):
//   { ok, parsedIntent, productId, name, priceUsd, rail, paymentChainId,
//     escrow, amountWei, amountHuman, orderIdRef, gasEstimateWei, signerWarn }

import 'dotenv/config';
import { getGame } from './_registry.mjs';
import { shopFetch } from './_api.mjs';
import { railToChainId } from './_chain.mjs';

function parseArgs(argv) {
  const out = { game: null, productId: null, pay: null };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--pay') out.pay = String(argv[++i] ?? '');
    else if (a.startsWith('--pay=')) out.pay = a.slice('--pay='.length);
    else positional.push(a);
  }
  if (positional.length > 0) out.game = positional[0];
  if (positional.length > 1) out.productId = positional[1];
  return out;
}

const args = parseArgs(process.argv.slice(2));
const parsedIntent = {
  command: 'quote',
  game: args.game ?? null,
  productId: args.productId ?? null,
  pay: args.pay ?? null,
};

function emit(envelope) {
  process.stdout.write(JSON.stringify({ ...envelope, ts: new Date().toISOString() }));
}

async function main() {
  if (!args.game || !args.productId || !args.pay) {
    const err = new Error('usage: quote.mjs <game> <productId> --pay <CROSS|BNB>');
    err.code = 'bad_args';
    err.exitCode = 2;
    throw err;
  }
  const game = getGame(args.game);
  parsedIntent.gameDisplayName = game.displayName;
  parsedIntent.paymentChainId = railToChainId(args.pay);

  // Will throw phase_1_not_captured (exit 3) on the skeleton build.
  const resp = await shopFetch(args.game, 'quotePath', {
    method: 'POST',
    body: { productId: args.productId, rail: args.pay.toUpperCase() },
  });

  emit({
    ok: true,
    parsedIntent,
    productId: args.productId,
    rail: args.pay.toUpperCase(),
    paymentChainId: parsedIntent.paymentChainId,
    quote: resp,
    note: 'quote.mjs returns the back-end-supplied paymentTarget verbatim; never recompute amount from priceUsd locally',
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
