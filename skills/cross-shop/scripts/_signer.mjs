// _signer.mjs — turn PRIVATE_KEY env into a viem Account + per-chain wallet
// client. PK is read from process.env.PRIVATE_KEY only. It is never logged,
// echoed, or written to disk by this module. WALLET_ADDRESS, when set, is
// checked against the address derived from the PK; mismatch is surfaced via
// a non-null `warn` field so the caller can echo it into the JSON envelope.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { privateKeyToAccount } from 'viem/accounts';
import { getWalletClient } from './_chain.mjs';

const PK_RE = /^0x[0-9a-fA-F]{64}$/;

/**
 * Read PRIVATE_KEY in priority order:
 *   1. process.env.PRIVATE_KEY (set explicitly by Bash invocation)
 *   2. ./.env in the user's CWD (picked up by dotenv/config in _chain.mjs)
 *   3. ~/.claude/skills/cross-shop/.env
 *
 * Returns the raw string or null. Does NOT echo, log, or persist.
 */
function readPrivateKeyFromAnySource() {
  if (process.env.PRIVATE_KEY) return process.env.PRIVATE_KEY;
  const homeDotEnv = path.join(os.homedir(), '.claude', 'skills', 'cross-shop', '.env');
  if (fs.existsSync(homeDotEnv)) {
    try {
      const txt = fs.readFileSync(homeDotEnv, 'utf8');
      for (const line of txt.split(/\r?\n/)) {
        const m = line.match(/^\s*PRIVATE_KEY\s*=\s*(.+?)\s*$/);
        if (m) return m[1].replace(/^['"]|['"]$/g, '');
      }
    } catch { /* swallow — fail closed */ }
  }
  return null;
}

export function loadAccount({ required = true } = {}) {
  const pk = readPrivateKeyFromAnySource();
  if (!pk) {
    if (!required) return { account: null, warn: null };
    const err = new Error('PRIVATE_KEY env var required (set in process env, ./.env, or ~/.claude/skills/cross-shop/.env)');
    err.code = 'missing_pk';
    throw err;
  }
  if (!PK_RE.test(pk)) {
    const err = new Error('PRIVATE_KEY must be 0x-prefixed 64-char hex');
    err.code = 'bad_pk_format';
    throw err;
  }
  const account = privateKeyToAccount(pk);
  const declared = process.env.WALLET_ADDRESS;
  let warn = null;
  if (declared && declared.toLowerCase() !== account.address.toLowerCase()) {
    warn = `WALLET_ADDRESS (${declared}) does not match address derived from PRIVATE_KEY (${account.address})`;
  }
  return { account, warn };
}

/**
 * Build a viem walletClient for a payment chain id. Read-only commands
 * SHOULD NOT call this; use _chain.getPublicClient(chainId) instead.
 */
export function makeSigner(chainId) {
  const { account, warn } = loadAccount({ required: true });
  const walletClient = getWalletClient(chainId, account);
  return { account, walletClient, warn };
}

export function walletTail(address) {
  return address ? address.slice(-6) : '';
}
