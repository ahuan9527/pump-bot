declare module '@solana/spl-token' {
  import { PublicKey, TransactionInstruction } from '@solana/web3.js';
  
  export const TOKEN_PROGRAM_ID: PublicKey;
  
  export function getAssociatedTokenAddressSync(
    mint: PublicKey,
    owner: PublicKey
  ): PublicKey;
  
  export function createAssociatedTokenAccountIdempotentInstruction(
    payer: PublicKey,
    associatedToken: PublicKey,
    owner: PublicKey,
    mint: PublicKey
  ): TransactionInstruction;
  
  export function createCloseAccountInstruction(
    account: PublicKey,
    destination: PublicKey,
    owner: PublicKey
  ): TransactionInstruction;
  
  export const AccountLayout: {
    decode(data: Buffer): {
      mint: PublicKey;
      owner: PublicKey;
      amount: bigint;
      delegateOption: number;
      delegate: PublicKey;
      state: number;
      isNativeOption: number;
      isNative: bigint;
      delegatedAmount: bigint;
      closeAuthorityOption: number;
      closeAuthority: PublicKey;
    };
  };
} 