declare module '@raydium-io/raydium-sdk' {
  import { PublicKey } from '@solana/web3.js';
  
  export class Token {
    constructor(
      programId: PublicKey,
      mint: PublicKey,
      decimals: number,
      symbol: string,
      name: string
    );
    
    static WSOL: Token;
    mint: PublicKey;
    symbol: string;
  }
  
  export class TokenAmount {
    constructor(token: Token, amount: string | number, isRaw?: boolean);
    toNumber(): number;
    raw: string;
    token: Token;
  }
  
  export class Liquidity {
    static makeSwapFixedInInstruction(params: any, version: number): { innerTransaction: any };
    static getAssociatedAuthority(params: { programId: PublicKey }): { publicKey: PublicKey };
  }
  
  export class Market {
    static getAssociatedAuthority(params: { programId: PublicKey, marketId: PublicKey }): { publicKey: PublicKey };
  }
  
  export const LIQUIDITY_STATE_LAYOUT_V4: any;
  export const MARKET_STATE_LAYOUT_V3: any;
  export const MAINNET_PROGRAM_ID: {
    AmmV4: PublicKey;
    OPENBOOK_MARKET: PublicKey;
  };
  
  export interface LiquidityStateV4 {
    baseMint: PublicKey;
    quoteMint: PublicKey;
    lpMint: PublicKey;
    baseDecimal: { toNumber: () => number };
    quoteDecimal: { toNumber: () => number };
    openOrders: PublicKey;
    targetOrders: PublicKey;
    baseVault: PublicKey;
    quoteVault: PublicKey;
    marketProgramId: PublicKey;
    marketId: PublicKey;
    withdrawQueue: PublicKey;
    lpVault: PublicKey;
  }
  
  export interface LiquidityPoolKeys {
    id: PublicKey;
    baseMint: PublicKey;
    quoteMint: PublicKey;
    lpMint: PublicKey;
    baseDecimals: number;
    quoteDecimals: number;
    lpDecimals: number;
    version: number;
    programId: PublicKey;
    authority: PublicKey;
    openOrders: PublicKey;
    targetOrders: PublicKey;
    baseVault: PublicKey;
    quoteVault: PublicKey;
    marketVersion: number;
    marketProgramId: PublicKey;
    marketId: PublicKey;
    marketAuthority: PublicKey;
    marketBaseVault: PublicKey;
    marketQuoteVault: PublicKey;
    marketBids: PublicKey;
    marketAsks: PublicKey;
    marketEventQueue: PublicKey;
    withdrawQueue: PublicKey;
    lpVault: PublicKey;
    lookupTableAccount: PublicKey;
  }
} 