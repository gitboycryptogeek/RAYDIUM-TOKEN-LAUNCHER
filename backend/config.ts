import { Connection, Keypair } from '@solana/web3.js';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
dotenv.config();

// Environment variables
const CLUSTER = process.env.SOLANA_CLUSTER || 'devnet';
const RPC_ENDPOINT = process.env.RPC_ENDPOINT || 'https://api.devnet.solana.com';
const WALLET_PATH = process.env.WALLET_PATH || './wallet.json';

// Create connection
export const connection = new Connection(RPC_ENDPOINT, 'confirmed');

// Load or create wallet
let keypair: Keypair;
try {
  if (fs.existsSync(WALLET_PATH)) {
    const secretKey = new Uint8Array(JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8')));
    keypair = Keypair.fromSecretKey(secretKey);
    console.log('Wallet loaded:', keypair.publicKey.toBase58());
  } else {
    keypair = Keypair.generate();
    fs.writeFileSync(WALLET_PATH, JSON.stringify(Array.from(keypair.secretKey)));
    console.log('New wallet generated:', keypair.publicKey.toBase58());
  }
} catch (error) {
  console.error('Error loading wallet:', error);
  keypair = Keypair.generate();
}

export { keypair, CLUSTER };