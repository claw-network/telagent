#!/usr/bin/env node
/**
 * ClawNet Testnet Faucet Server
 *
 * Dispenses small amounts of testnet gas to new wallets for DID registration.
 * Designed to run on a server that holds the deployer/treasury key.
 *
 * Environment variables:
 *   FAUCET_PRIVATE_KEY  - Private key of the funded treasury wallet (required)
 *   FAUCET_RPC_URL      - Chain RPC URL (default: https://rpc.clawnetd.com)
 *   FAUCET_PORT         - HTTP port (default: 8545)
 *   FAUCET_AMOUNT       - Amount in wei per drip (default: 10000000000000000 = 0.01 ETH)
 *   FAUCET_COOLDOWN_SEC - Cooldown per address in seconds (default: 86400 = 24h)
 *
 * Usage:
 *   FAUCET_PRIVATE_KEY=0x... node --experimental-strip-types scripts/faucet-server.mts
 *
 * API:
 *   POST /drip  { "address": "0x..." }  →  { "txHash": "0x...", "amount": "..." }
 *   GET  /health                        →  { "ok": true, "balance": "..." }
 */

import http from 'node:http';
import { ethers } from 'ethers';

const PRIVATE_KEY = process.env.FAUCET_PRIVATE_KEY;
if (!PRIVATE_KEY) {
  console.error('FAUCET_PRIVATE_KEY is required');
  process.exit(1);
}

const RPC_URL = process.env.FAUCET_RPC_URL || 'https://rpc.clawnetd.com';
const PORT = parseInt(process.env.FAUCET_PORT || '8545', 10);
const DRIP_AMOUNT = BigInt(process.env.FAUCET_AMOUNT || '10000000000000000'); // 0.01 ETH
const COOLDOWN_MS = parseInt(process.env.FAUCET_COOLDOWN_SEC || '86400', 10) * 1000;

const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

// In-memory rate limit: address → last drip timestamp
const lastDrip = new Map<string, number>();

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 4096) {
        reject(new Error('Body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function jsonResponse(res: http.ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') {
      const balance = await provider.getBalance(wallet.address);
      jsonResponse(res, 200, { ok: true, balance: balance.toString(), address: wallet.address });
      return;
    }

    if (req.method === 'POST' && req.url === '/drip') {
      const body = await readBody(req);
      let parsed: { address?: string };
      try {
        parsed = JSON.parse(body) as { address?: string };
      } catch {
        jsonResponse(res, 400, { error: 'Invalid JSON' });
        return;
      }

      const address = parsed.address;
      if (!address || !ethers.isAddress(address)) {
        jsonResponse(res, 400, { error: 'Invalid or missing address' });
        return;
      }

      const normalized = address.toLowerCase();

      // Rate limiting
      const last = lastDrip.get(normalized);
      if (last && Date.now() - last < COOLDOWN_MS) {
        const retryAfterSec = Math.ceil((COOLDOWN_MS - (Date.now() - last)) / 1000);
        jsonResponse(res, 429, { error: 'Rate limited', retryAfterSec });
        return;
      }

      // Check if the address already has enough balance
      const currentBalance = await provider.getBalance(address);
      if (currentBalance >= DRIP_AMOUNT) {
        jsonResponse(res, 200, { error: 'none', message: 'Already funded', balance: currentBalance.toString() });
        return;
      }

      // Send gas
      const tx = await wallet.sendTransaction({
        to: address,
        value: DRIP_AMOUNT,
      });
      await tx.wait();

      lastDrip.set(normalized, Date.now());
      console.log(`[faucet] Dripped ${ethers.formatEther(DRIP_AMOUNT)} to ${address} tx=${tx.hash}`);
      jsonResponse(res, 200, { txHash: tx.hash, amount: DRIP_AMOUNT.toString() });
      return;
    }

    jsonResponse(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error('[faucet] Error:', err);
    jsonResponse(res, 500, { error: 'Internal error' });
  }
});

server.listen(PORT, () => {
  console.log(`[faucet] Listening on port ${PORT}`);
  console.log(`[faucet] Treasury: ${wallet.address}`);
  console.log(`[faucet] Drip amount: ${ethers.formatEther(DRIP_AMOUNT)} ETH`);
  console.log(`[faucet] Cooldown: ${COOLDOWN_MS / 1000}s`);
});
