#!/usr/bin/env node
// login.mjs — exchange a Game UUID for a cross.shop session token.
//
// SKELETON (v0.1-rc-skeleton): short-circuits with phase_1_not_captured
// (exit 3) until both `loginPath` and `sessionHeader` are populated in
// references/games.json for the requested game. See references/cross-shop.md
// §3 for the capture playbook.
//
// Usage:
//   node scripts/login.mjs <game> --uuid <UUID> [--persist]
//
// UUID handling (REQUIREMENTS SEC-02):
//   - read from --uuid flag OR env GAME_UUID_<SLUG_UPPER_SNAKE>
//   - never echoed in stdout/stderr
//   - persisted at rest only as sha256(uuid) (in _session.mjs)
//   - --persist toggles writing the session file; default is in-memory only

import 'dotenv/config';
import { getGame, requireSlot } from './_registry.mjs';
import { shopFetch } from './_api.mjs';
import { saveSession } from './_session.mjs';

function parseArgs(argv) {
  const out = { game: null, uuid: null, persist: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--uuid') out.uuid = String(argv[++i] ?? '');
    else if (a.startsWith('--uuid=')) out.uuid = a.slice('--uuid='.length);
    else if (a === '--persist') out.persist = true;
    else positional.push(a);
  }
  if (positional.length > 0) out.game = positional[0];
  return out;
}

const args = parseArgs(process.argv.slice(2));
const parsedIntent = {
  command: 'login',
  game: args.game ?? null,
  persist: args.persist,
  uuidProvided: Boolean(args.uuid),
};

function emit(envelope) {
  process.stdout.write(JSON.stringify({ ...envelope, ts: new Date().toISOString() }));
}

function uuidFromEnv(slug) {
  const k = `GAME_UUID_${String(slug).toUpperCase().replace(/-/g, '_')}`;
  return process.env[k] || null;
}

async function main() {
  if (!args.game) {
    const err = new Error('usage: login.mjs <game> --uuid <UUID> [--persist]');
    err.code = 'bad_args';
    err.exitCode = 2;
    throw err;
  }
  const game = getGame(args.game);
  parsedIntent.gameDisplayName = game.displayName;

  const uuid = args.uuid || uuidFromEnv(args.game);
  if (!uuid) {
    const err = new Error('Game UUID required: pass --uuid <UUID> or set GAME_UUID_<SLUG>');
    err.code = 'missing_uuid';
    err.exitCode = 2;
    throw err;
  }

  // These will throw phase_1_not_captured (exit 3) on the skeleton build.
  requireSlot(args.game, 'loginPath');
  requireSlot(args.game, 'sessionHeader');

  // Once Phase 1 is captured, the body shape will be one of:
  //   { uuid }              (raw UUID body)
  //   { game, uuid }        (game slug + UUID body)
  //   { token: <oauth> }    (per-game OAuth bridge — v0.2)
  // The capture playbook tells the user which.
  const resp = await shopFetch(args.game, 'loginPath', {
    method: 'POST',
    body: { uuid },
  });

  const token = resp?.token ?? resp?.sessionToken ?? resp?.data?.token ?? null;
  const expiresAt = resp?.expiresAt ?? resp?.data?.expiresAt ?? null;
  if (!token) {
    const err = new Error('login response did not contain a session token');
    err.code = 'login_no_token';
    throw err;
  }

  let persistedAt = null;
  if (args.persist) {
    const saved = saveSession(args.game, { token, expiresAt, uuid });
    persistedAt = saved._path;
  }

  emit({
    ok: true,
    parsedIntent,
    expiresAt,
    persisted: Boolean(args.persist),
    persistedAt,
    note: 'token held for this invocation; not echoed back',
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
