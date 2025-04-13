import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

export class Config {
  private static instance: Config;
  private wallet: Keypair | null = null;
  private config: { [key: string]: string } = {};

  private constructor() {
    this.loadConfig();
  }

  public static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config();
    }
    return Config.instance;
  }

  private loadConfig() {
    try {
      const envPath = path.resolve(process.cwd(), '.env');
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split('\n').forEach(line => {
          const [key, value] = line.split('=').map(s => s.trim());
          if (key && value && !key.startsWith('#')) {
            this.config[key] = value;
          }
        });
      }
    } catch (error) {
      logger.error('Error loading config:', error);
      throw new Error('Failed to load configuration');
    }
  }

  public getWallet(): Keypair {
    if (!this.wallet) {
      const privateKey = this.getEnvVariable('PRIVATE_KEY');
      try {
        this.wallet = Keypair.fromSecretKey(bs58.decode(privateKey));
      } catch (error) {
        logger.error('Error creating wallet:', error);
        throw new Error('Failed to create wallet from private key');
      }
    }
    return this.wallet;
  }

  public getEnvVariable(key: string): string {
    const value = this.config[key];
    if (!value) {
      logger.error(`${key} is not set in configuration`);
      throw new Error(`Configuration error: ${key} is not set`);
    }
    return value;
  }

  public getRpcEndpoint(): string {
    return this.getEnvVariable('RPC_ENDPOINT');
  }

  public getRpcWebsocketEndpoint(): string {
    return this.getEnvVariable('RPC_WEBSOCKET_ENDPOINT');
  }

  public getQuoteMint(): string {
    return this.getEnvVariable('QUOTE_MINT');
  }

  public getQuoteAmount(): string {
    return this.getEnvVariable('QUOTE_AMOUNT');
  }

  public getCommitmentLevel(): string {
    return this.getEnvVariable('COMMITMENT_LEVEL');
  }

  public getUseSnipeList(): boolean {
    return this.getEnvVariable('USE_SNIPE_LIST') === 'true';
  }

  public getSnipeListRefreshInterval(): number {
    return parseInt(this.getEnvVariable('SNIPE_LIST_REFRESH_INTERVAL'));
  }

  public getCheckIfMintIsRenounced(): boolean {
    return this.getEnvVariable('CHECK_IF_MINT_IS_RENOUNCED') === 'true';
  }

  public getAutoSell(): boolean {
    return this.getEnvVariable('AUTO_SELL') === 'true';
  }

  public getMaxSellRetries(): number {
    return parseInt(this.getEnvVariable('MAX_SELL_RETRIES'));
  }

  public getAutoSellDelay(): number {
    return parseInt(this.getEnvVariable('AUTO_SELL_DELAY'));
  }

  public getTakeProfit(): number {
    return parseInt(this.getEnvVariable('TAKE_PROFIT'));
  }

  public getStopLoss(): number {
    return parseInt(this.getEnvVariable('STOP_LOSS'));
  }

  public getMinPoolSize(): string {
    return this.getEnvVariable('MIN_POOL_SIZE');
  }
}