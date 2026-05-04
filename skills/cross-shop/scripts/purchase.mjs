#!/usr/bin/env node
// purchase.mjs — execute a cross.shop purchase end-to-end.
//
// SKELETON (v0.1-rc-skeleton):
//   - --pay CARD                : aborts immediately with `unsupported_rail_v0_1`
//   - --pay CROSS | BNB         : short-circuits with phase_1_not_captured
//                                 (exit 3) until quotePath / confirmPath /
//                                 statusPath / escrow* are all populated.
//
// Once Phase 1 is captured, the implementation will:
//   1. Fetch live quote (in-process) for {game, productId, rail}.
//   2. Run _guard.enforcePurchaseGuards (chainId, gas floor, USD cap, confirm).
//   3. Build payment-escrow tx referencing orderId; broadcast via viem.
//   4. POST /orders/confirm with {orderId, txHash, signerAddress}.
//   5. Poll statusPath until terminal OR RECEIPT_TIMEOUT — never `ok:false`
//      on timeout: emit `{ok:true, deliveryStatus:"pending", txHash, orderId}`
//      with explorer link so the user can re-poll later via status.mjs.

import 'dotenv/config';
import { getGame } from './_registry.mjs';
import { railToChainId } from './_chain.mjs';

function parseArgs(argv) {
  const out = { game: null, productId: null, pay: null, confirm: false, maxApprove: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--pay') out.pay = String(argv[++i] ?? '');
    else if (a.startsWith('--pay=')) out.pay = a.slice('--pay='.length);
    else if (a === '--confirm') out.confirm = true;
    else if (a === '--max-approve') out.maxApprove = true;
    else positional.push(a);
  }
  if (positional.length > 0) out.game = positional[0];
  if (positional.length > 1) out.productId = positional[1];
  return out;
}

const args = parseArgs(process.argv.slice(2));
const parsedIntent = {
  command: 'purchase',
  game: args.game ?? null,
  productId: args.productId ?? null,
  pay: args.pay ?? null,
  confirm: args.confirm,
};

function emit(envelope) {
  process.stdout.write(JSON.stringify({ ...envelope, ts: new Date().toISOString() }));
}

async function main() {
  if (!args.game || !args.productId || !args.pay) {
    const err = new Error('usage: purchase.mjs <game> <productId> --pay <CROSS|BNB> [--confirm]');
    err.code = 'bad_args';
    err.exitCode = 2;
    throw err;
  }

  // Validate game exists in registry up-front (throws unknown_game).
  const game = getGame(args.game);
  parsedIntent.gameDisplayName = game.displayName;

  // CARD rail explicitly unsupported in v0.1.
  const rail = args.pay.toUpperCase();
  if (rail === 'CARD') {
    const err = new Error(
      'credit-card payment is out of scope for v0.1; finish in browser at the game shop URL'
    );
    err.code = 'unsupported_rail_v0_1';
    err.hint = `open ${game.homepage ?? game.subdomain ?? 'cross.shop'} in a browser to use the hosted-checkout flow once captured in v0.2`;
    err.exitCode = 2;
    throw err;
  }

  // CROSS / BNB: validate rail and resolve chain id (throws unsupported_rail).
  parsedIntent.paymentChainId = railToChainId(rail);

  // SKELETON: every downstream slot is null until Phase 1. Surface that
  // structurally so the user knows exactly which capture is missing.
  const err = new Error(
    `purchase.mjs requires Phase-1 captures for game "${args.game}" (rail ${rail}); see references/cross-shop.md`
  );
  err.code = 'phase_1_not_captured';
  err.missing = `${args.game}.{quotePath,confirmPath,statusPath,${rail === 'CROSS' ? 'escrowCROSS' : 'escrowBSC'}}`;
  err.hint = 'see references/cross-shop.md §5–§7 to capture the quote, confirm, status, and escrow ABI cells';
  err.exitCode = 3;
  throw err;
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
