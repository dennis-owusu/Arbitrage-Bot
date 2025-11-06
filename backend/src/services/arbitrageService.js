import { fetchMarketData, fetchOrderBook, fetchFees } from './exchangeService.js';

// List of symbols to monitor (expandable)
const symbols = ['BTC/USDT', 'ETH/USDT', 'LTC/USDT', 'XRP/USDT']; // Example symbols

// Minimum profit threshold 
const MIN_PROFIT_THRESHOLD = 1.2; // 1.2%

// Function to calculate potential arbitrage profit
async function calculateArbitrage(symbol) {
  const exchangeData = {};
  const exchangeNames = ['binance', 'kucoin', 'coinbasepro', 'kraken'];

  // Fetch data for each exchange
  for (const name of exchangeNames) {
    const market = await fetchMarketData(symbol, name);
    const orderBook = await fetchOrderBook(symbol, name);
    const fees = await fetchFees(name, symbol);

    if (market && orderBook && fees) {
      exchangeData[name] = {
        ask: market.ask,
        bid: market.bid,
        askDepth: orderBook.askDepth,
        bidDepth: orderBook.bidDepth,
        tradingFees: fees.trading,
        withdrawalFee: fees.withdrawal,
        depositFee: fees.deposit,
        networkFee: fees.network,
      };
    }
  }

  // Find lowest ask (buy) and highest bid (sell)
  let buyExchange = null;
  let sellExchange = null;
  let lowestAsk = Infinity;
  let highestBid = -Infinity;

  for (const [name, data] of Object.entries(exchangeData)) {
    if (data.ask && data.ask < lowestAsk) {
      lowestAsk = data.ask;
      buyExchange = { name, ...data };
    }
    if (data.bid && data.bid > highestBid) {
      highestBid = data.bid;
      sellExchange = { name, ...data };
    }
  }

  if (!buyExchange || !sellExchange || buyExchange.name === sellExchange.name) {
    return null; // No opportunity
  }

  // Calculate profit (simplified: assume amount = 1 unit, include fees)
  const amount = 1; // Base amount for calculation
  const buyCost = lowestAsk * amount;
  const buyFee = buyCost * (buyExchange.tradingFees.taker || 0);
  const totalBuy = buyCost + buyFee;

  const sellRevenue = highestBid * amount;
  const sellFee = sellRevenue * (sellExchange.tradingFees.maker || 0);
  const totalSell = sellRevenue - sellFee;

  // If transfers needed, add withdrawal and deposit fees (assume base currency)
  const transferFee = buyExchange.withdrawalFee + sellExchange.depositFee + buyExchange.networkFee;

  const netProfit = totalSell - totalBuy - transferFee;
  const profitPercent = (netProfit / totalBuy) * 100;

  if (profitPercent >= MIN_PROFIT_THRESHOLD) {
    return {
      symbol,
      buyExchange: buyExchange.name,
      sellExchange: sellExchange.name,
      buyPrice: lowestAsk,
      sellPrice: highestBid,
      profitPercent,
      netProfit,
      depthAvailable: Math.min(buyExchange.askDepth, sellExchange.bidDepth) >= amount, // Check liquidity
    };
  }
  return null;
}

// Polling function to check for arbitrage opportunities
function startArbitragePolling(interval = 30000) { // Every 30 seconds
  setInterval(async () => {
    const opportunities = [];
    for (const symbol of symbols) {
      const opp = await calculateArbitrage(symbol);
      if (opp) {
        opportunities.push(opp);
      }
    }
    if (opportunities.length > 0) {
      // Only log opportunities to the console; do not emit to frontend
      console.log('[Arb:v1] Found opportunities:', opportunities);
    }
  }, interval);
}

// Do NOT auto-start polling from this legacy service to avoid duplication
// export { calculateArbitrage, startArbitragePolling };
export { calculateArbitrage, startArbitragePolling }