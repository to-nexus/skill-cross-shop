// _chain.mjs — payment-chain registry for the cross-shop skill.
//
// cross.shop v0.1 supports two payment rails:
//   CROSS  — CROSS Chain (chain id 612055), native CROSS gas/value
//   BNB    — BSC         (chain id 56),     native BNB   gas/value
//
// This module:
//   1. Maps the rail label to a chain id.
//   2. Resolves the RPC URL (env override → fallback).
//   3. Builds viem public/wallet clients keyed by chain id.
//   4. Provides the `ensureChainId(publicClient, expected)` guard used
//      by _guard.mjs before any write tx.

import { createPublicClient, createWalletClient, http, defineChain } from 'viem';
import 'dotenv/config';

const CHAIN_REGISTRY = {
  56: {
    id: 56,
    name: 'BNB Smart Chain',
    nativeSymbol: 'BNB',
    nativeDecimals: 18,
    explorerTxBase: 'https://bscscan.com/tx/',
    rpcEnv: 'BSC_RPC_URL',
    fallbackRpc: 'https://bsc-dataseed.binance.org/',
  },
  612055: {
    id: 612055,
    name: 'CROSS Chain',
    nativeSymbol: 'CROSS',
    nativeDecimals: 18,
    explorerTxBase: 'https://explorer.crosstoken.io/612055/tx/',
    rpcEnv: 'CROSS_RPC_URL',
    fallbackRpc: 'https://mainnet.crosstoken.io:22001/',
  },
};

// Rail label (as accepted by --pay) → chain id.
const RAIL_TO_CHAIN = {
  CROSS: 612055,
  BNB: 56,
};

export function railToChainId(rail) {
  const cid = RAIL_TO_CHAIN[String(rail).toUpperCase()];
  if (!cid) {
    const err = new Error(
      `unsupported payment rail "${rail}" (supported: ${Object.keys(RAIL_TO_CHAIN).join(', ')})`
    );
    err.code = 'unsupported_rail';
    err.exitCode = 2;
    throw err;
  }
  return cid;
}

export function chainIdToRail(chainId) {
  for (const [rail, cid] of Object.entries(RAIL_TO_CHAIN)) {
    if (Number(cid) === Number(chainId)) return rail;
  }
  return null;
}

export function listSupportedRails() {
  return Object.keys(RAIL_TO_CHAIN);
}

export function getChainMeta(chainId) {
  return CHAIN_REGISTRY[chainId] ?? null;
}

export function resolveRpcUrl(chainId) {
  const reg = CHAIN_REGISTRY[chainId];
  if (!reg) {
    const err = new Error(`unsupported chain id ${chainId}`);
    err.code = 'unsupported_chain';
    throw err;
  }
  const envRpc = process.env[reg.rpcEnv];
  if (envRpc && envRpc.length > 0) return envRpc;
  return reg.fallbackRpc;
}

export function buildViemChain(chainId, rpcUrlOverride = null) {
  const reg = CHAIN_REGISTRY[chainId];
  if (!reg) {
    const err = new Error(`unsupported chain id ${chainId}`);
    err.code = 'unsupported_chain';
    throw err;
  }
  const rpcUrl = rpcUrlOverride ?? resolveRpcUrl(chainId);
  return defineChain({
    id: reg.id,
    name: reg.name,
    nativeCurrency: { name: reg.nativeSymbol, symbol: reg.nativeSymbol, decimals: reg.nativeDecimals },
    rpcUrls: { default: { http: [rpcUrl] } },
    blockExplorers: { default: { name: `${reg.name} Explorer`, url: reg.explorerTxBase.replace(/\/tx\/$/, '') } },
  });
}

export function getPublicClient(chainId) {
  const chain = buildViemChain(chainId);
  return createPublicClient({ chain, transport: http() });
}

export function getWalletClient(chainId, account) {
  const chain = buildViemChain(chainId);
  return createWalletClient({ account, chain, transport: http() });
}

export async function ensureChainId(publicClient, expected) {
  const cid = await publicClient.getChainId();
  if (Number(cid) !== Number(expected)) {
    const err = new Error(`connected chainId ${cid}, expected ${expected}`);
    err.code = 'wrong_chain';
    throw err;
  }
  return cid;
}

export function explorerTx(chainId, hash) {
  const reg = CHAIN_REGISTRY[chainId];
  if (!reg) return null;
  return `${reg.explorerTxBase}${hash}`;
}
