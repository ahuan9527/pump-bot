import {
  Liquidity,
  LIQUIDITY_STATE_LAYOUT_V4,
  LiquidityPoolKeys,
  LiquidityStateV4,
  MARKET_STATE_LAYOUT_V3,
  Token,
  TokenAmount,
} from '@raydium-io/raydium-sdk';
import {
  AccountLayout,
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {
  Keypair,
  Connection,
  PublicKey,
  ComputeBudgetProgram,
  TransactionMessage,
  VersionedTransaction,
  Commitment,
} from '@solana/web3.js';
import { getTokenAccounts, RAYDIUM_LIQUIDITY_PROGRAM_ID_V4, OPENBOOK_PROGRAM_ID, createPoolKeys } from './liquidity';
import { retry } from './utils';
import { Config } from './config/config';
import { TradingProtection } from './trading/trading-protection';
import { getMinimalMarketV3, MinimalMarketLayoutV3 } from './market';
import { MintLayout } from './types';
import bs58 from 'bs58';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './utils/logger';

// Define BigNumberish type
type BigNumberish = string | number | bigint;

// Define KeyedAccountInfo interface
interface KeyedAccountInfo {
  accountId: PublicKey;
  accountInfo: {
    data: Buffer;
    executable: boolean;
    lamports: number;
    owner: PublicKey;
    rentEpoch: number;
  };
}

// Helper function to convert TokenAmount to string
function tokenAmountToString(amount: TokenAmount): string {
  return amount.raw.toString();
}

const config = Config.getInstance();
const tradingProtection = TradingProtection.getInstance();

const network = 'mainnet-beta';
const RPC_ENDPOINT = config.getRpcEndpoint();
const RPC_WEBSOCKET_ENDPOINT = config.getRpcWebsocketEndpoint();

const solanaConnection = new Connection(RPC_ENDPOINT, {
  wsEndpoint: RPC_WEBSOCKET_ENDPOINT,
});

export type MinimalTokenAccountData = {
  mint: PublicKey;
  address: PublicKey;
  buyValue?: number;
  poolKeys?: LiquidityPoolKeys;
  market?: MinimalMarketLayoutV3;
};

let existingLiquidityPools: Set<string> = new Set<string>();
let existingOpenBookMarkets: Set<string> = new Set<string>();
let existingTokenAccounts: Map<string, MinimalTokenAccountData> = new Map<string, MinimalTokenAccountData>();
let wallet: Keypair;
let quoteToken: Token;
let quoteTokenAssociatedAddress: PublicKey;
let quoteAmount: TokenAmount;
let quoteMinPoolSizeAmount: TokenAmount;
let commitment: Commitment = config.getCommitmentLevel() as Commitment;
let snipeList: string[] = [];

const TAKE_PROFIT = config.getTakeProfit();
const STOP_LOSS = config.getStopLoss();
const CHECK_IF_MINT_IS_RENOUNCED = config.getCheckIfMintIsRenounced();
const USE_SNIPE_LIST = config.getUseSnipeList();
const SNIPE_LIST_REFRESH_INTERVAL = config.getSnipeListRefreshInterval();
const AUTO_SELL = config.getAutoSell();
const MAX_SELL_RETRIES = config.getMaxSellRetries();
const MIN_POOL_SIZE = config.getMinPoolSize();

// 扩展 Connection 类型
declare module '@solana/web3.js' {
  interface Connection {
    onProgramAccountChange(
      programId: PublicKey,
      callback: (accountInfo: KeyedAccountInfo) => void,
      commitment?: Commitment,
      filters?: any[]
    ): number;
  }
}

async function init(): Promise<void> {
  try {
    // get wallet
    wallet = config.getWallet();
    
    // get quote mint and amount
    const QUOTE_MINT = config.getQuoteMint();
    const QUOTE_AMOUNT = config.getQuoteAmount();
    
    switch (QUOTE_MINT) {
      case 'WSOL': {
        quoteToken = Token.WSOL;
        quoteAmount = new TokenAmount(Token.WSOL, QUOTE_AMOUNT, false);
        quoteMinPoolSizeAmount = new TokenAmount(quoteToken, MIN_POOL_SIZE, false);
        break;
      }
      case 'USDC': {
        quoteToken = new Token(
          TOKEN_PROGRAM_ID,
          new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'),
          6,
          'USDC',
          'USDC',
        );
        quoteAmount = new TokenAmount(quoteToken, QUOTE_AMOUNT, false);
        break;
      }
      default: {
        throw new Error(`Unsupported quote mint "${QUOTE_MINT}". Supported values are USDC and WSOL`);
      }
    }
    
    logger.info(
      `Min pool size: ${quoteMinPoolSizeAmount.raw.toString()} ${quoteToken.symbol}`,
    );
    logger.info(`Buy amount: ${quoteAmount.raw.toString()} ${quoteToken.symbol}`);
    
    // check existing wallet for associated token account of quote mint
    const tokenAccounts = await getTokenAccounts(solanaConnection, wallet.publicKey, commitment);
    for (const ta of tokenAccounts) {
      existingTokenAccounts.set(ta.accountInfo.mint.toString(), <MinimalTokenAccountData>{
        mint: ta.accountInfo.mint,
        address: ta.pubkey,
      });
    }
    
    const tokenAccount = tokenAccounts.find((acc) => acc.accountInfo.mint.toString() === quoteToken.mint.toString())!;
    if (!tokenAccount) {
      throw new Error(`No ${quoteToken.symbol} token account found in wallet: ${wallet.publicKey}`);
    }
    quoteTokenAssociatedAddress = tokenAccount.pubkey;
    
    // load tokens to snipe
    loadSnipeList();
    
    logger.info('Initialization completed successfully');
  } catch (error) {
    logger.error('Error during initialization:', error);
    throw error;
  }
}

function saveTokenAccount(mint: PublicKey, accountData: MinimalMarketLayoutV3) {
  const ata = getAssociatedTokenAddressSync(mint, wallet.publicKey);
  const tokenAccount = <MinimalTokenAccountData>{
    address: ata,
    mint: mint,
    market: <MinimalMarketLayoutV3>{
      bids: accountData.bids,
      asks: accountData.asks,
      eventQueue: accountData.eventQueue,
    },
  };
  existingTokenAccounts.set(mint.toString(), tokenAccount);
  return tokenAccount;
}

export async function processRaydiumPool(id: PublicKey, poolState: LiquidityStateV4) {
  if (!shouldBuy(poolState.baseMint.toString())) {
    return;
  }
  if (CHECK_IF_MINT_IS_RENOUNCED) {
    const mintOption = await checkMintable(poolState.baseMint);
    if (!mintOption) {
      logger.warn({ mint: poolState.baseMint }, 'Skipping, owner can mint tokens!');
      return;
    }
  }
  await buy(id, poolState);
}

export async function checkMintable(vault: PublicKey): Promise<boolean | undefined> {
  try {
    let { data } = (await solanaConnection.getAccountInfo(vault)) || {};
    if (!data) {
      return;
    }
    const deserialize = MintLayout.decode(data);
    return deserialize.mintAuthorityOption === 0;
  } catch (e) {
    logger.error({ mint: vault }, `Failed to check if mint is renounced`);
  }
}

export async function processOpenBookMarket(updatedAccountInfo: KeyedAccountInfo) {
  let accountData: MinimalMarketLayoutV3 | undefined;
  try {
    const decoded = MARKET_STATE_LAYOUT_V3.decode(updatedAccountInfo.accountInfo.data);
    accountData = {
      bids: decoded.bids,
      asks: decoded.asks,
      eventQueue: decoded.eventQueue,
      baseMint: decoded.baseMint,
    };
    // to be competitive, we collect market data before buying the token...
    if (existingTokenAccounts.has(accountData.baseMint.toString())) {
      return;
    }
    saveTokenAccount(accountData.baseMint, accountData);
  } catch (e) {
    logger.error({ mint: accountData?.baseMint }, `Failed to process market`);
  }
}

async function buy(accountId: PublicKey, accountData: LiquidityStateV4): Promise<void> {
  try {
    let tokenAccount = existingTokenAccounts.get(accountData.baseMint.toString());
    if (!tokenAccount) {
      const market = await getMinimalMarketV3(solanaConnection, accountData.marketId, commitment);
      tokenAccount = saveTokenAccount(accountData.baseMint, market);
    }
    
    // Check trade safety before executing
    const safetyCheck = await tradingProtection.checkTradeSafety(
      solanaConnection,
      accountData.baseMint,
      quoteAmount,
      0 // You should calculate the expected price here
    );
    
    if (!safetyCheck.safe) {
      logger.warn(`Trade safety check failed: ${safetyCheck.reason}`);
      return;
    }
    
    tokenAccount.poolKeys = createPoolKeys(accountId, accountData, tokenAccount.market!);
    const { innerTransaction } = Liquidity.makeSwapFixedInInstruction(
      {
        poolKeys: tokenAccount.poolKeys,
        userKeys: {
          tokenAccountIn: quoteTokenAssociatedAddress,
          tokenAccountOut: tokenAccount.address,
          owner: wallet.publicKey,
        },
        amountIn: quoteAmount.raw,
        minAmountOut: 0,
      },
      tokenAccount.poolKeys.version,
    );
    
    const latestBlockhash = await solanaConnection.getLatestBlockhash({
      commitment: commitment,
    });
    
    const messageV0 = new TransactionMessage({
      payerKey: wallet.publicKey,
      recentBlockhash: latestBlockhash.blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 421197 }),
        ComputeBudgetProgram.setComputeUnitLimit({ units: 101337 }),
        createAssociatedTokenAccountIdempotentInstruction(
          wallet.publicKey,
          tokenAccount.address,
          wallet.publicKey,
          accountData.baseMint,
        ),
        ...innerTransaction.instructions,
      ],
    }).compileToV0Message();
    
    const transaction = new VersionedTransaction(messageV0);
    transaction.sign([wallet, ...innerTransaction.signers]);
    const rawTransaction = transaction.serialize();
    
    const signature = await retry(
      () =>
        solanaConnection.sendRawTransaction(rawTransaction, {
          skipPreflight: true,
        }),
      { retries: 3, retryIntervalMs: 1000 },
    );
    
    logger.info(`Transaction sent: ${signature}`);
    
    const confirmation = await solanaConnection.confirmTransaction({
      signature,
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
    });
    
    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${confirmation.value.err}`);
    }
    
    logger.info(`Transaction confirmed: ${signature}`);
  } catch (error) {
    logger.error('Error in buy function:', error);
    throw error;
  }
}

async function sell(accountId: PublicKey, mint: PublicKey, amount: BigNumberish, value: number): Promise<boolean> {
  let retries = 0;
  do {
    try {
      const tokenAccount = existingTokenAccounts.get(mint.toString());
      if (!tokenAccount) {
        return true;
      }
      if (!tokenAccount.poolKeys) {
        logger.warn({ mint }, 'No pool keys found');
        continue;
      }
      if (amount === 0) {
        logger.info(
          {
            mint: tokenAccount.mint,
          },
          `Empty balance, can't sell`,
        );
        return true;
      }
      // check st/tp
      if (tokenAccount.buyValue === undefined) return true;
      const netChange = (value - tokenAccount.buyValue) / tokenAccount.buyValue;
      if (netChange > STOP_LOSS && netChange < TAKE_PROFIT) return false;
      const { innerTransaction } = Liquidity.makeSwapFixedInInstruction(
        {
          poolKeys: tokenAccount.poolKeys!,
          userKeys: {
            tokenAccountOut: quoteTokenAssociatedAddress,
            tokenAccountIn: tokenAccount.address,
            owner: wallet.publicKey,
          },
          amountIn: amount,
          minAmountOut: 0,
        },
        tokenAccount.poolKeys!.version,
      );
      const latestBlockhash = await solanaConnection.getLatestBlockhash({
        commitment: commitment,
      });
      const messageV0 = new TransactionMessage({
        payerKey: wallet.publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: [
          ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 400000 }),
          ComputeBudgetProgram.setComputeUnitLimit({ units: 200000 }),
          ...innerTransaction.instructions,
          createCloseAccountInstruction(tokenAccount.address, wallet.publicKey, wallet.publicKey),
        ],
      }).compileToV0Message();
      const transaction = new VersionedTransaction(messageV0);
      transaction.sign([wallet, ...innerTransaction.signers]);
      const signature = await solanaConnection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
      });
      const confirmation = await solanaConnection.confirmTransaction({
        signature,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        blockhash: latestBlockhash.blockhash,
      });
      if (confirmation.value.err) {
        continue;
      }
      logger.info(
        {
          mint,
          signature,
          url: `https://solscan.io/tx/${signature}?cluster=${network}`,
          dex: `https://dexscreener.com/solana/${mint}?maker=${wallet.publicKey}`,
        },
        `Confirmed sell tx... Sold at: ${value}\tNet Profit: ${netChange * 100}%`,
      );
      return true;
    } catch (e: any) {
      retries++;
      logger.error({ mint }, `Failed to sell token, retry: ${retries}/${MAX_SELL_RETRIES}`);
    }
  } while (retries < MAX_SELL_RETRIES);
  return true;
}

// async function getMarkPrice(connection: Connection, baseMint: PublicKey, quoteMint?: PublicKey): Promise<number> {
//   const marketAddress = await Market.findAccountsByMints(
//     solanaConnection,
//     baseMint,
//     quoteMint === undefined ? Token.WSOL.mint : quoteMint,
//     TOKEN_PROGRAM_ID,
//   );
//   const market = await Market.load(solanaConnection, marketAddress[0].publicKey, {}, TOKEN_PROGRAM_ID);
//   const bestBid = (await market.loadBids(solanaConnection)).getL2(1)[0][0];
//   const bestAsk = (await market.loadAsks(solanaConnection)).getL2(1)[0][0];
//   return (bestAsk + bestBid) / 2;
// }

function loadSnipeList() {
  if (!USE_SNIPE_LIST) {
    return;
  }
  const data = fs.readFileSync(path.join(__dirname, 'snipe-list.txt'), 'utf-8');
  snipeList = data
    .split('\n')
    .map((line: string) => line.trim())
    .filter((line: string) => line);
}

function shouldBuy(key: string): boolean {
  return USE_SNIPE_LIST ? snipeList.includes(key) : true;
}

const runListener = async () => {
  await init();
  const runTimestamp = Math.floor(new Date().getTime() / 1000);
  const raydiumSubscriptionId = solanaConnection.onProgramAccountChange(
    RAYDIUM_LIQUIDITY_PROGRAM_ID_V4,
    async (updatedAccountInfo: KeyedAccountInfo) => {
      const key = updatedAccountInfo.accountId.toString();
      const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(updatedAccountInfo.accountInfo.data);
      const poolOpenTime = parseInt(poolState.poolOpenTime.toString());
      const existing = existingLiquidityPools.has(key);
      if (poolOpenTime > runTimestamp && !existing) {
        existingLiquidityPools.add(key);
        const _ = processRaydiumPool(updatedAccountInfo.accountId, poolState);
      }
    },
    commitment,
    [
      { dataSize: LIQUIDITY_STATE_LAYOUT_V4.span },
      {
        memcmp: {
          offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf('quoteMint'),
          bytes: quoteToken.mint.toBase58(),
        },
      },
      {
        memcmp: {
          offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf('marketProgramId'),
          bytes: OPENBOOK_PROGRAM_ID.toBase58(),
        },
      },
      {
        memcmp: {
          offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf('status'),
          bytes: bs58.encode(new Uint8Array([6, 0, 0, 0, 0, 0, 0, 0])),
        },
      },
    ],
  );
  const openBookSubscriptionId = solanaConnection.onProgramAccountChange(
    OPENBOOK_PROGRAM_ID,
    async (updatedAccountInfo) => {
      const key = updatedAccountInfo.accountId.toString();
      const existing = existingOpenBookMarkets.has(key);
      if (!existing) {
        existingOpenBookMarkets.add(key);
        const _ = processOpenBookMarket(updatedAccountInfo);
      }
    },
    commitment,
    [
      { dataSize: MARKET_STATE_LAYOUT_V3.span },
      {
        memcmp: {
          offset: MARKET_STATE_LAYOUT_V3.offsetOf('quoteMint'),
          bytes: quoteToken.mint.toBase58(),
        },
      },
    ],
  );
  if (AUTO_SELL) {
    const walletSubscriptionId = solanaConnection.onProgramAccountChange(
      TOKEN_PROGRAM_ID,
      async (updatedAccountInfo) => {
        const accountData = AccountLayout.decode(updatedAccountInfo.accountInfo!.data);
        if (updatedAccountInfo.accountId.toBase58() === quoteTokenAssociatedAddress.toBase58()) {
          return;
        }
        let completed = false;
        while (!completed) {
          setTimeout(() => {}, 1000);
          const currValue = await retrieveTokenValueByAddress(accountData.mint.toBase58());
          if (currValue) {
            logger.info(accountData.mint, `Current Price: ${currValue} SOL`);
            completed = await sell(updatedAccountInfo.accountId, accountData.mint, accountData.amount, currValue);
          }
        }
      },
      commitment,
      [
        {
          dataSize: 165,
        },
        {
          memcmp: {
            offset: 32,
            bytes: wallet.publicKey.toBase58(),
          },
        },
      ],
    );
    logger.info(`Listening for wallet changes: ${walletSubscriptionId}`);
  }
  logger.info(`Listening for raydium changes: ${raydiumSubscriptionId}`);
  logger.info(`Listening for open book changes: ${openBookSubscriptionId}`);
  if (USE_SNIPE_LIST) {
    setInterval(loadSnipeList, SNIPE_LIST_REFRESH_INTERVAL);
  }
};

async function retrieveTokenValueByAddress(mintAddress: string): Promise<number | null> {
  try {
    // 这里实现获取代币价值的逻辑
    // 示例实现，实际应根据你的需求修改
    return 0;
  } catch (error) {
    logger.error(`Failed to retrieve token value for ${mintAddress}:`, error);
    return null;
  }
}

runListener();
