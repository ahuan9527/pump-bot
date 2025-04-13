import { Connection, PublicKey } from '@solana/web3.js';
import { TokenAmount } from '@raydium-io/raydium-sdk';
import { logger } from '../utils/logger';
import { Config } from '../config/config';

export class TradingProtection {
  private static instance: TradingProtection;
  private config: Config;
  private maxSlippage: number = 1; // 1% default slippage
  private maxTradeSize: number = 1000; // Maximum trade size in SOL
  private minLiquidity: number = 100; // Minimum liquidity in SOL
  private mockLiquidity: number = 1000; // Mock liquidity for testing
  private mockPriceImpact: number = 0.5; // Mock price impact for testing

  private constructor() {
    try {
      this.config = Config.getInstance();
      logger.info('TradingProtection initialized successfully');
    } catch (error) {
      logger.error('Error initializing TradingProtection:', error);
      throw error;
    }
  }

  public static getInstance(): TradingProtection {
    if (!TradingProtection.instance) {
      TradingProtection.instance = new TradingProtection();
    }
    return TradingProtection.instance;
  }

  private getAmountInSol(amount: TokenAmount): number {
    try {
      // 添加更多日志记录
      logger.info(`Raw amount: ${amount.raw.toString()}`);
      
      // 使用固定的小数位数 (SOL 有 9 位小数)
      const decimals = 9;
      const rawAmount = Number(amount.raw.toString());
      const amountInSol = rawAmount / Math.pow(10, decimals);
      
      logger.info(`Converted amount in SOL: ${amountInSol}`);
      return amountInSol;
    } catch (error) {
      logger.error('Error converting amount to SOL:', error);
      throw error;
    }
  }

  public async checkTradeSafety(
    connection: Connection,
    tokenMint: PublicKey,
    amount: TokenAmount,
    expectedPrice: number
  ): Promise<{ safe: boolean; reason?: string }> {
    try {
      const amountInSol = this.getAmountInSol(amount);
      logger.info(`Checking trade safety for token ${tokenMint.toString()}, amount: ${amountInSol} SOL`);
      
      // Check trade size
      if (amountInSol > this.maxTradeSize) {
        logger.info(`Trade size ${amountInSol} SOL exceeds maximum allowed ${this.maxTradeSize} SOL`);
        return {
          safe: false,
          reason: `Trade size ${amountInSol} SOL exceeds maximum allowed ${this.maxTradeSize} SOL`
        };
      }

      // Check liquidity
      const liquidity = await this.getTokenLiquidity(connection, tokenMint);
      logger.info(`Token liquidity: ${liquidity} SOL, minimum required: ${this.minLiquidity} SOL`);
      if (liquidity < this.minLiquidity) {
        logger.info(`Insufficient liquidity: ${liquidity} SOL < ${this.minLiquidity} SOL`);
        return {
          safe: false,
          reason: `Insufficient liquidity: ${liquidity} SOL < ${this.minLiquidity} SOL`
        };
      }

      // Check price impact
      const priceImpact = await this.calculatePriceImpact(connection, tokenMint, amount);
      logger.info(`Price impact: ${priceImpact}%, maximum allowed: ${this.maxSlippage}%`);
      if (priceImpact > this.maxSlippage) {
        logger.info(`Price impact ${priceImpact}% exceeds maximum allowed ${this.maxSlippage}%`);
        return {
          safe: false,
          reason: `Price impact ${priceImpact}% exceeds maximum allowed ${this.maxSlippage}%`
        };
      }

      logger.info('Trade is safe');
      return { safe: true };
    } catch (error) {
      logger.error('Error checking trade safety:', error);
      return {
        safe: false,
        reason: 'Failed to check trade safety'
      };
    }
  }

  private async getTokenLiquidity(connection: Connection, tokenMint: PublicKey): Promise<number> {
    try {
      // For testing purposes, return mock liquidity
      logger.info(`Getting token liquidity for ${tokenMint.toString()}, returning mock value: ${this.mockLiquidity} SOL`);
      return this.mockLiquidity;
    } catch (error) {
      logger.error('Error getting token liquidity:', error);
      return 0; // Return 0 instead of throwing error
    }
  }

  private async calculatePriceImpact(
    connection: Connection,
    tokenMint: PublicKey,
    amount: TokenAmount
  ): Promise<number> {
    try {
      // For testing purposes, return mock price impact
      logger.info(`Calculating price impact for ${tokenMint.toString()}, returning mock value: ${this.mockPriceImpact}%`);
      return this.mockPriceImpact;
    } catch (error) {
      logger.error('Error calculating price impact:', error);
      return 100; // Return a high value to fail the check
    }
  }

  public setMaxSlippage(slippage: number) {
    this.maxSlippage = slippage;
    logger.info(`Max slippage set to ${slippage}%`);
  }

  public setMaxTradeSize(size: number) {
    this.maxTradeSize = size;
    logger.info(`Max trade size set to ${size} SOL`);
  }

  public setMinLiquidity(liquidity: number) {
    this.minLiquidity = liquidity;
    logger.info(`Min liquidity set to ${liquidity} SOL`);
  }

  // For testing purposes
  public setMockLiquidity(liquidity: number) {
    this.mockLiquidity = liquidity;
    logger.info(`Mock liquidity set to ${liquidity} SOL`);
  }

  public setMockPriceImpact(priceImpact: number) {
    this.mockPriceImpact = priceImpact;
    logger.info(`Mock price impact set to ${priceImpact}%`);
  }
}