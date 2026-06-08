#!/usr/bin/env node
// games.mjs — list every supported game shop seeded in references/games.json.
//
// This is the ONE subcommand that works today without any Phase-1 capture:
// it simply emits the registry contents (including null endpoint slots) so
// the user can see which games are wired and which still need DevTools work.
//
// Output: ONE JSON object on stdout. Exit code 0 on success, 1 on runtime error.

import 'dotenv/config';
import { listGames, registryVersion } from './_registry.mjs';

const parsedIntent = { command: 'games' };

function emit(envelope) {
  process.stdout.write(JSON.stringify({ ...envelope, ts: new Date().toISOString() }));
}

async function main() {
  const games = listGames();

  // For each game, summarize: which slots are captured (non-null), which are
  // still phase_1_pending. This drives the "what works today?" UX.
  const summary = games.map((g) => {
    const slots = ['apiBase', 'loginPath', 'productsPath', 'quotePath',
      'confirmPath', 'ordersPath', 'statusPath', 'sessionHeader',
      'escrowCROSS', 'escrowBSC'];
    const captured = slots.filter((k) => g[k] !== null && g[k] !== undefined && g[k] !== '');
    const missing = slots.filter((k) => !captured.includes(k));
    return {
      slug: g.slug,
      displayName: g.displayName ?? g.slug,
      subdomain: g.subdomain ?? null,
      homepage: g.homepage ?? null,
      paymentRails: g.paymentRails ?? [],
      capturedSlots: captured,
      missingSlots: missing,
      captureStatus: g._capture_status ?? (missing.length === 0 ? 'complete' : 'phase_1_pending'),
    };
  });

  emit({
    ok: true,
    parsedIntent,
    registryVersion: registryVersion(),
    count: summary.length,
    games: summary,
    note: summary.some((g) => g.missingSlots.length > 0)
      ? 'Some games have missing endpoint slots; only `games.mjs` works until references/cross-shop.md is followed to populate them.'
      : 'All slots captured.',
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
    signerWarn: null,
  });
  process.exit(err?.exitCode ?? 1);
});
