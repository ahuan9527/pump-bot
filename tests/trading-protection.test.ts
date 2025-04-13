import { Connection, PublicKey } from '@solana/web3.js';
import { TokenAmount, Token } from '@raydium-io/raydium-sdk';
import { TradingProtection } from '../trading/trading-protection';
import { Config } from '../config/config';
import { logger } from '../utils/logger';

describe('TradingProtection', () => {
  let tradingProtection: TradingProtection;
  let connection: Connection;
  let testTokenMint: PublicKey;
  let testAmount: TokenAmount;

  beforeEach(() => {
    try {
      logger.info('Setting up test environment');
      tradingProtection = TradingProtection.getInstance();
      connection = new Connection(Config.getInstance().getRpcEndpoint());
      testTokenMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'); // USDC mint
      // 使用0.1 SOL (1e8 lamports)
      testAmount = new TokenAmount(Token.WSOL, '100000000', false);
      
      // Reset mock values and trading parameters
      tradingProtection.setMockLiquidity(1000);
      tradingProtection.setMockPriceImpact(0.5);
      tradingProtection.setMaxTradeSize(1000);
      tradingProtection.setMinLiquidity(100);
      tradingProtection.setMaxSlippage(1.0);
      logger.info('Test environment setup complete');
    } catch (error) {
      logger.error('Error setting up test environment:', error);
      throw error;
    }
  });

  describe('checkTradeSafety', () => {
    it('should return safe: true for valid trade parameters', async () => {
      try {
        logger.info('Running test: should return safe: true for valid trade parameters');
        const result = await tradingProtection.checkTradeSafety(
          connection,
          testTokenMint,
          testAmount,
          1.0
        );
        logger.info(`Test result: ${JSON.stringify(result)}`);
        expect(result.safe).toBe(true);
      } catch (error) {
        logger.error('Error in test:', error);
        throw error;
      }
    });

    it('should return safe: false when trade size exceeds maximum', async () => {
      try {
        logger.info('Running test: should return safe: false when trade size exceeds maximum');
        // 设置最大交易规模为0.05 SOL，小于测试金额0.1 SOL
        tradingProtection.setMaxTradeSize(0.05);
        const result = await tradingProtection.checkTradeSafety(
          connection,
          testTokenMint,
          testAmount,
          1.0
        );
        logger.info(`Test result: ${JSON.stringify(result)}`);
        expect(result.safe).toBe(false);
        expect(result.reason).toContain('exceeds maximum allowed');
      } catch (error) {
        logger.error('Error in test:', error);
        throw error;
      }
    });

    it('should return safe: false when liquidity is insufficient', async () => {
      try {
        logger.info('Running test: should return safe: false when liquidity is insufficient');
        // 设置足够大的最大交易规模，避免交易规模检查失败
        tradingProtection.setMaxTradeSize(10);
        // 设置最小流动性为2000 SOL，大于模拟流动性1000 SOL
        tradingProtection.setMinLiquidity(2000);
        tradingProtection.setMockLiquidity(1000);
        const result = await tradingProtection.checkTradeSafety(
          connection,
          testTokenMint,
          testAmount,
          1.0
        );
        logger.info(`Test result: ${JSON.stringify(result)}`);
        expect(result.safe).toBe(false);
        expect(result.reason).toContain('Insufficient liquidity');
      } catch (error) {
        logger.error('Error in test:', error);
        throw error;
      }
    });

    it('should return safe: false when price impact exceeds maximum', async () => {
      try {
        logger.info('Running test: should return safe: false when price impact exceeds maximum');
        // 设置足够大的最大交易规模，避免交易规模检查失败
        tradingProtection.setMaxTradeSize(10);
        // 设置最大滑点为0.1%，小于模拟价格影响0.5%
        tradingProtection.setMaxSlippage(0.1);
        tradingProtection.setMockPriceImpact(0.5);
        const result = await tradingProtection.checkTradeSafety(
          connection,
          testTokenMint,
          testAmount,
          1.0
        );
        logger.info(`Test result: ${JSON.stringify(result)}`);
        expect(result.safe).toBe(false);
        expect(result.reason).toContain('Price impact');
      } catch (error) {
        logger.error('Error in test:', error);
        throw error;
      }
    });
  });

  describe('configuration', () => {
    it('should update max slippage correctly', async () => {
      try {
        logger.info('Running test: should update max slippage correctly');
        // 设置足够大的最大交易规模，避免交易规模检查失败
        tradingProtection.setMaxTradeSize(10);
        // 设置最大滑点为2.5%，大于模拟价格影响2.0%
        const newSlippage = 2.5;
        tradingProtection.setMaxSlippage(newSlippage);
        tradingProtection.setMockPriceImpact(2.0);
        const result = await tradingProtection.checkTradeSafety(
          connection,
          testTokenMint,
          testAmount,
          1.0
        );
        logger.info(`Test result: ${JSON.stringify(result)}`);
        expect(result.safe).toBe(true);
      } catch (error) {
        logger.error('Error in test:', error);
        throw error;
      }
    });

    it('should update max trade size correctly', async () => {
      try {
        logger.info('Running test: should update max trade size correctly');
        // 设置最大交易规模为5 SOL，大于测试金额0.1 SOL
        const newSize = 5.0;
        tradingProtection.setMaxTradeSize(newSize);
        const result = await tradingProtection.checkTradeSafety(
          connection,
          testTokenMint,
          testAmount,
          1.0
        );
        logger.info(`Test result: ${JSON.stringify(result)}`);
        expect(result.safe).toBe(true);
      } catch (error) {
        logger.error('Error in test:', error);
        throw error;
      }
    });

    it('should update min liquidity correctly', async () => {
      try {
        logger.info('Running test: should update min liquidity correctly');
        // 设置足够大的最大交易规模，避免交易规模检查失败
        tradingProtection.setMaxTradeSize(10);
        // 设置最小流动性为500 SOL，小于模拟流动性1000 SOL
        const newLiquidity = 500;
        tradingProtection.setMinLiquidity(newLiquidity);
        tradingProtection.setMockLiquidity(1000);
        const result = await tradingProtection.checkTradeSafety(
          connection,
          testTokenMint,
          testAmount,
          1.0
        );
        logger.info(`Test result: ${JSON.stringify(result)}`);
        expect(result.safe).toBe(true);
      } catch (error) {
        logger.error('Error in test:', error);
        throw error;
      }
    });
  });
}); 