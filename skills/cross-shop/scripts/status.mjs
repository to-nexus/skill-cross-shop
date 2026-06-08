#!/usr/bin/env node
// status.mjs — poll a single cross.shop order until delivered/failed/timeout.
//
// SKELETON (v0.1-rc-skeleton): short-circuits with phase_1_not_captured
// (exit 3) until `statusPath` is populated in references/games.json for
// the requested game.
//
// Usage:
//   node scripts/status.mjs <game> <orderId> [--watch <sec>]
//
// Output: ONE JSON envelope per call. In --watch mode, emits one envelope
// per cycle until terminal OR RECEIPT_TIMEOUT (or 60 polls, whichever first).
// Distinguishes:
//   - on-chain confirmation status (txHash + chain explorer)
//   - back-end delivery status (`pending` → `delivered` | `failed`)

import 'dotenv/config';
import { getGame } from './_registry.mjs';
import { shopFetch } from './_api.mjs';
import { loadSession } from './_session.mjs';

function parseArgs(argv) {
  const out = { game: null, orderId: null, watch: null };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--watch') out.watch = Number(argv[++i]);
    else if (a.startsWith('--watch=')) out.watch = Number(a.slice('--watch='.length));
    else positional.push(a);
  }
  if (positional.length > 0) out.game = positional[0];
  if (positional.length > 1) out.orderId = positional[1];
  return out;
}

const args = parseArgs(process.argv.slice(2));
const parsedIntent = {
  command: 'status',
  game: args.game ?? null,
  orderId: args.orderId ?? null,
  watch: args.watch,
};

function emit(envelope) {
  process.stdout.write(JSON.stringify({ ...envelope, ts: new Date().toISOString() }) + '\n');
}

function isTerminal(status) {
  if (!status) return false;
  const s = String(status).toLowerCase();
  return s === 'delivered' || s === 'failed' || s === 'cancelled' || s === 'refunded';
}

async function fetchStatus(game, orderId, sessionToken) {
  // Will throw phase_1_not_captured on the skeleton build.
  return shopFetch(game, 'statusPath', {
    method: 'GET',
    query: { orderId },
    sessionToken,
  });
}

async function main() {
  if (!args.game || !args.orderId) {
    const err = new Error('usage: status.mjs <game> <orderId> [--watch <sec>]');
    err.code = 'bad_args';
    err.exitCode = 2;
    throw err;
  }
  const game = getGame(args.game);
  parsedIntent.gameDisplayName = game.displayName;

  const session = loadSession(args.game);
  // status MAY be unauthenticated; we pass token only if available.
  const token = session?.token ?? null;

  if (args.watch && args.watch > 0) {
    const intervalMs = Math.max(1000, Math.floor(args.watch * 1000));
    for (let i = 0; i < 60; i++) {
      try {
        const data = await fetchStatus(args.game, args.orderId, token);
        const deliveryStatus = data?.deliveryStatus ?? data?.status ?? null;
        emit({
          ok: true,
          parsedIntent,
          mode: 'watch',
          poll: i + 1,
          deliveryStatus,
          terminal: isTerminal(deliveryStatus),
          data,
          signerWarn: null,
        });
        if (isTerminal(deliveryStatus)) return;
      } catch (err) {
        emit({
          ok: false,
          parsedIntent,
          mode: 'watch',
          poll: i + 1,
          error: err?.code || 'unknown_error',
          message: err?.message || String(err),
          missing: err?.missing ?? null,
          hint: err?.hint ?? null,
          signerWarn: null,
        });
        if (err?.code === 'phase_1_not_captured') {
          process.exit(err.exitCode ?? 3);
        }
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    return;
  }

  const data = await fetchStatus(args.game, args.orderId, token);
  const deliveryStatus = data?.deliveryStatus ?? data?.status ?? null;
  emit({
    ok: true,
    parsedIntent,
    mode: 'once',
    deliveryStatus,
    terminal: isTerminal(deliveryStatus),
    data,
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
