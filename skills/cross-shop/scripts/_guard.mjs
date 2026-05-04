// _guard.mjs — pre-flight safety rails for cross-shop write ops.
//
// Pipeline for any write op (login.mjs / purchase.mjs):
//   1. ensureChainId(publicClient, paymentChainId)         — wrong_chain
//   2. native gas pre-flight (MIN_GAS_NATIVE, default 0.001) — insufficient_gas
//   3. MAX_PURCHASE_NOTIONAL cap (USD)                      — cap_exceeded
//   4. CONFIRM_THRESHOLD + --confirm gate (USD)             — awaiting_confirm (exit 2)
//   5. game existence guard (caller-supplied via _registry) — unknown_game
//   6. product existence guard (caller-supplied)            — unknown_product
//   7. session-mismatch warning (non-fatal)                 — propagated as signerWarn
//
// signerWarn is propagated by the caller (it comes from _signer.loadAccount).

import { formatEther, parseEther } from 'viem';
import { ensureChainId } from './_chain.mjs';

function envNumber(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    const err = new Error(`${name} must be a non-negative number, got "${raw}"`);
    err.code = 'bad_env';
    throw err;
  }
  return n;
}

/**
 * Run all pre-flight write guards. Throws on the first failure.
 *
 * @param {object} args
 * @param {object} args.publicClient
 * @param {`0x${string}`} args.account     EOA address
 * @param {number} args.paymentChainId     56 (BNB) or 612055 (CROSS)
 * @param {number} args.priceUsd           USD notional from the back-end quote
 * @param {boolean} args.confirm           --confirm flag was passed
 * @param {object}  args.parsedIntent      shape echoed back into errors
 */
export async function enforcePurchaseGuards({
  publicClient,
  account,
  paymentChainId,
  priceUsd,
  confirm,
  parsedIntent,
}) {
  // 1. chain-id
  await ensureChainId(publicClient, paymentChainId);

  // 2. native gas pre-flight
  const minGas = envNumber('MIN_GAS_NATIVE', 0.001);
  if (minGas > 0) {
    const native = await publicClient.getBalance({ address: account });
    if (native < parseEther(String(minGas))) {
      const err = new Error(
        `native balance ${formatEther(native)} < MIN_GAS_NATIVE ${minGas}`
      );
      err.code = 'insufficient_gas';
      err.parsedIntent = parsedIntent;
      throw err;
    }
  }

  // 3. MAX_PURCHASE_NOTIONAL cap (USD)
  const capRaw = process.env.MAX_PURCHASE_NOTIONAL;
  if (capRaw !== undefined && capRaw !== '') {
    const cap = Number(capRaw);
    if (!Number.isFinite(cap) || cap < 0) {
      const err = new Error(`MAX_PURCHASE_NOTIONAL must be non-negative, got "${capRaw}"`);
      err.code = 'bad_env';
      throw err;
    }
    if (Number(priceUsd) > cap) {
      const err = new Error(
        `priceUsd ${priceUsd} exceeds MAX_PURCHASE_NOTIONAL=${cap}`
      );
      err.code = 'cap_exceeded';
      err.parsedIntent = parsedIntent;
      throw err;
    }
  }

  // 4. --confirm gate
  const confirmThreshold = envNumber('CONFIRM_THRESHOLD', 10);
  if (Number(priceUsd) > confirmThreshold && !confirm) {
    const err = new Error('awaiting_confirm');
    err.code = 'awaiting_confirm';
    err.parsedIntent = parsedIntent;
    err.exitCode = 2;
    throw err;
  }
}

/**
 * Product-existence guard. Aborts with `unknown_product` if `productId`
 * isn't found in the supplied product list. Caller fetches the list via
 * scripts/products.mjs (or its in-process equivalent).
 */
export function assertProductSupported({ products, productId }) {
  if (!Array.isArray(products) || products.length === 0) {
    const err = new Error('product list empty or unavailable');
    err.code = 'unknown_product';
    throw err;
  }
  const hit = products.find(
    (p) => String(p.productId ?? p.id) === String(productId)
  );
  if (!hit) {
    const err = new Error(
      `productId "${productId}" not in products list (count=${products.length})`
    );
    err.code = 'unknown_product';
    throw err;
  }
  return hit;
}

export function emitSignerWarn(warn) {
  return warn ?? null;
}
