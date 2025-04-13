import { Commitment, Connection, PublicKey } from '@solana/web3.js';
import { MARKET_STATE_LAYOUT_V3 } from '@raydium-io/raydium-sdk';
import { MINIMAL_MARKET_STATE_LAYOUT_V3 } from '../liquidity';

export type MinimalMarketStateLayoutV3 = typeof MINIMAL_MARKET_STATE_LAYOUT_V3;
export type MinimalMarketLayoutV3 = {
  bids: PublicKey;
  asks: PublicKey;
  eventQueue: PublicKey;
  baseMint: PublicKey;
};

export async function getMinimalMarketV3(
  connection: Connection,
  marketId: PublicKey,
  commitment?: Commitment,
): Promise<MinimalMarketLayoutV3> {
  const marketInfo = await connection.getAccountInfo(marketId, {
    commitment,
  });

  if (!marketInfo) {
    throw new Error(`Market account ${marketId.toString()} not found`);
  }

  const decoded = MARKET_STATE_LAYOUT_V3.decode(marketInfo.data);
  return {
    bids: decoded.bids,
    asks: decoded.asks,
    eventQueue: decoded.eventQueue,
    baseMint: decoded.baseMint,
  };
}
