declare module '@solana/web3.js' {
  export class PublicKey {
    constructor(value: string | Uint8Array);
    toString(): string;
    toBase58(): string;
    static default: PublicKey;
  }
  
  export class Keypair {
    publicKey: PublicKey;
    static fromSecretKey(secretKey: Uint8Array): Keypair;
  }
  
  export class Connection {
    constructor(endpoint: string, config?: { wsEndpoint?: string });
    getLatestBlockhash(config?: { commitment?: Commitment }): Promise<{ blockhash: string, lastValidBlockHeight: number }>;
    sendRawTransaction(rawTransaction: Buffer, options?: { skipPreflight?: boolean }): Promise<string>;
    confirmTransaction(params: { signature: string, blockhash: string, lastValidBlockHeight: number }): Promise<{ value: { err: any } }>;
    getBalance(publicKey: PublicKey): Promise<number>;
    getRecentBlockhash(): Promise<{ blockhash: string, feeCalculator: { lamportsPerSignature: number } }>;
    getAccountInfo(publicKey: PublicKey, config?: { commitment?: Commitment }): Promise<{ data: Buffer } | null>;
    getTokenAccountsByOwner(owner: PublicKey, filter: { programId: PublicKey }, commitment?: Commitment): Promise<{ value: { pubkey: PublicKey, account: { owner: PublicKey, data: Buffer } }[] }>;
  }
  
  export class Transaction {
    constructor(params?: { recentBlockhash?: string, feePayer?: PublicKey });
    add(...instructions: any[]): Transaction;
  }
  
  export class TransactionMessage {
    constructor(params: { payerKey: PublicKey, recentBlockhash: string, instructions: any[] });
    compileToV0Message(): any;
  }
  
  export class VersionedTransaction {
    constructor(message: any);
    sign(signers: Keypair[]): void;
    serialize(): Buffer;
  }
  
  export class ComputeBudgetProgram {
    static setComputeUnitPrice(params: { microLamports: number }): any;
    static setComputeUnitLimit(params: { units: number }): any;
  }
  
  export class SystemProgram {
    static transfer(params: { fromPubkey: PublicKey, toPubkey: PublicKey, lamports: number }): any;
  }
  
  export type Commitment = 'processed' | 'confirmed' | 'finalized';
  
  export interface SlotInfo {
    slot: number;
    parent: number;
    status: string;
  }
  
  export function clusterApiUrl(cluster: string): string;
} 