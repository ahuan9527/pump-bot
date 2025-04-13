declare module 'bs58' {
  export function encode(buffer: Uint8Array): string;
  export function decode(str: string): Uint8Array;
} 