import ccxt from 'ccxt';
import { io } from '../../server.js';

// List of supported exchanges
const exchangeNames = ['binance', 'kucoin', 'gate', 'bitget', 'mexc', 'bybit'];

// Initialize exchanges with rate limiting enabled and increased timeout
const exchanges = {};
const exchangeConfigs = {
  binance: { apiKey: process.env.BINANCE_API_KEY, secret: process.env.BINANCE_SECRET_KEY },
  kucoin: { apiKey: process.env.KUCOIN_API_KEY, secret: process.env.KUCOIN_SECRET_KEY, password: process.env.KUCOIN_PASSPHRASE },
  gate: { apiKey: process.env.GATEIO_API_KEY, secret: process.env.GATEIO_SECRET_KEY },
  bitget: { apiKey: process.env.BITGET_API_KEY, secret: process.env.BITGET_SECRET_KEY },
  mexc: { apiKey: process.env.MEXC_API_KEY, secret: process.env.MEXC_SECRET_KEY },
  bybit: { apiKey: process.env.BYBIT_API_KEY, secret: process.env.BYBIT_SECRET_KEY, options: { defaultType: 'spot' } },
};
exchangeNames.forEach(name => {
  exchanges[name] = new ccxt[name]({
    ...exchangeConfigs[name],
    enableRateLimit: true,
    timeout: 30000, // Increase timeout to 30 seconds
  });
});

// Error handling wrapper
async function safeCall(func, ...args) {
  try {
    return await func(...args);
  } catch (error) {
    console.error(`CCXT Error: ${error.message}`);
    if (error instanceof ccxt.RateLimitExceeded) {
      console.log('Rate limit exceeded, retrying after delay...');
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simple backoff
      return await func(...args);
    }
    return null; // Or throw if critical
  }
}

// Debug flag and markets cache utilities
const ARB_DEBUG = process.env.ARB_DEBUG === 'true';
const marketsCache = {};
async function loadMarketsCached(exchangeName) {
  const ex = exchanges[exchangeName];
  if (!ex) return null;
  if (!marketsCache[exchangeName]) {
    const markets = await safeCall(ex.loadMarkets.bind(ex));
    marketsCache[exchangeName] = markets || {};
  }
  return marketsCache[exchangeName];
}

// Fetch market data (ticker)
async function fetchMarketData(symbol, exchangeName) {
  const exchange = exchanges[exchangeName];
  const ticker = await safeCall(exchange.fetchTicker.bind(exchange), symbol);
  if (!ticker) return null;
  return {
    lastPrice: ticker.last,
    bid: ticker.bid,
    ask: ticker.ask,
    spread: ticker.ask - ticker.bid,
    volume: ticker.baseVolume,
    priceChangePercent: ticker.change,
  };
}

// Fetch order book with depth
async function fetchOrderBook(symbol, exchangeName, limit = 20) {
  const exchange = exchanges[exchangeName];
  const orderBook = await safeCall(exchange.fetchOrderBook.bind(exchange), symbol, limit);
  if (!orderBook) return null;
  return {
    bestBid: orderBook.bids[0]?.[0] || null,
    bestAsk: orderBook.asks[0]?.[0] || null,
    bidDepth: orderBook.bids.reduce((sum, [price, amount]) => sum + amount, 0),
    askDepth: orderBook.asks.reduce((sum, [price, amount]) => sum + amount, 0),
  };
}

// Fetch fees (trading, withdrawal, etc.)
async function fetchFees(exchangeName, symbol) {
  const exchange = exchanges[exchangeName];
  const markets = await loadMarketsCached(exchangeName);
  const market = markets ? markets[symbol] : undefined;
  const tradingFees = market ? { maker: market.maker, taker: market.taker } : { maker: null, taker: null };
  // Avoid expensive fetchCurrencies calls each loop; withdrawal fees vary widely by network and are not used in real-time arbitrage
  return {
    trading: tradingFees,
    withdrawal: null,
    deposit: 0,
    network: 0,
  };
}

// Trading functions
async function fetchBalance(exchangeName) {
  const exchange = exchanges[exchangeName];
  return await safeCall(exchange.fetchBalance.bind(exchange));
}

async function createOrder(exchangeName, symbol, type, side, amount, price = undefined) {
  const exchange = exchanges[exchangeName];
  return await safeCall(exchange.createOrder.bind(exchange), symbol, type, side, amount, price);
}

async function withdraw(exchangeName, currency, amount, address, tag = null) {
  const exchange = exchanges[exchangeName];
  return await safeCall(exchange.withdraw.bind(exchange), currency, amount, address, tag);
}

// Updated polling to include more data
function startPricePolling(symbol, interval = 10000) {
  setInterval(async () => {
    const data = {};
    for (const name of exchangeNames) {
      data[name] = {
        market: await fetchMarketData(symbol, name),
        orderBook: await fetchOrderBook(symbol, name),
        fees: await fetchFees(name, symbol),
      };
    }
    io.emit('priceUpdate', { symbol, data }); // Broadcast enhanced data
    console.log(`Broadcasted data for ${symbol}`);
  }, interval);
}

// Start polling for a default symbol (e.g., BTC/USDT)
// Comment out polling to prevent interference during testing
// startPricePolling('BTC/USDT');

// New function to fetch all required data for a trading pair on a specific exchange
async function fetchTradingPairData(exchangeName, symbol) {
  if (!exchanges[exchangeName]) {
    return { error: `Exchange ${exchangeName} not supported` };
  }
  const exchange = exchanges[exchangeName];

  // Load markets (cached) and validate
  const markets = await loadMarketsCached(exchangeName);
  if (!markets) return { error: 'Failed to load markets' };
  const market = markets[symbol];
  if (!market) return { error: `Symbol ${symbol} not supported on ${exchangeName}` };
  if (!market.active) return { error: `Symbol ${symbol} is not active on ${exchangeName}` };
  if (!market.spot) return { error: `Symbol ${symbol} is not tradable (spot) on ${exchangeName}` };

  // Fetch ticker for market data
  const ticker = await safeCall(exchange.fetchTicker.bind(exchange), symbol);
  if (!ticker) return { error: 'Failed to fetch ticker' };

  // Fetch order book with adjusted limit
  let obLimit = 20;
  const orderBook = await safeCall(exchange.fetchOrderBook.bind(exchange), symbol, obLimit);
  if (!orderBook) return { error: 'Failed to fetch order book' };

  // Extract top 20
  const topBids = orderBook.bids.slice(0, 20).map(([p, a]) => ({ price: p, amount: a }));
  const topAsks = orderBook.asks.slice(0, 20).map(([p, a]) => ({ price: p, amount: a }));

  const price = {
    last: ticker.last,
    bid: ticker.bid,
    ask: ticker.ask,
    spread: ticker.ask - ticker.bid,
    volume: ticker.baseVolume,
    changePercent: ticker.percentage,
  };

  const orderbook = {
    bestBid: orderBook.bids[0]?.[0] || null,
    bestAsk: orderBook.asks[0]?.[0] || null,
    bids: topBids,
    asks: topAsks,
  };

  const fees = {
    maker: market.maker,
    taker: market.taker,
    withdrawal: null,
    deposit: 0,
    network: 0,
  };

  const limits = {
    minAmount: market.limits.amount.min,
    maxAmount: market.limits.amount.max,
    minPrice: market.limits.price.min,
    maxPrice: market.limits.price.max,
    minCost: market.limits.cost.min,
    maxCost: market.limits.cost.max,
  };

  const precision = {
    price: market.precision.price,
    amount: market.precision.amount,
  };

  return {
    symbol,
    price,
    orderbook,
    fees,
    limits,
    precision,
  };
}

// New function to get active spot USDT pairs for an exchange

async function getUSDTSpotSymbols(exchangeName) {
  if (!exchanges[exchangeName]) {
    throw new Error(`Exchange ${exchangeName} not supported`);
  }
  const exchange = exchanges[exchangeName];
  const markets = await safeCall(exchange.loadMarkets.bind(exchange));
  if (!markets) {
    console.warn(`[getUSDTSpotSymbols] loadMarkets failed for ${exchangeName}. Returning empty list.`);
    return [];
  }
  return Object.keys(markets).filter(symbol => {
    const market = markets[symbol];
    return symbol.endsWith('/USDT') && market.active && market.spot;
  });
}

// New function to get common USDT spot symbols across exchanges (present on at least 2 exchanges)
async function getCommonUSDTSymbols() {
  const symbolCounts = new Map();

  for (const exchangeName of exchangeNames) {
    try {
      const symbols = await getUSDTSpotSymbols(exchangeName);
      for (const symbol of symbols) {
        symbolCounts.set(symbol, (symbolCounts.get(symbol) || 0) + 1);
      }
    } catch (err) {
      console.warn(`[getCommonUSDTSymbols] Failed for ${exchangeName}: ${err.message}. Continuing.`);
    }
  }

  const common = Array.from(symbolCounts.entries())
    .filter(([symbol, count]) => count >= 2)
    .map(([symbol]) => symbol);

  if (common.length === 0) {
    console.error('[getCommonUSDTSpotSymbols] No common symbols found. Returning empty list to enforce real data only.');
    return [];
  }
  return common;
}

// In-memory latest snapshot store
let latestSnapshot = { timestamp: null, data: null };
export function getLatestSnapshot() {
  return latestSnapshot;
}

// In-memory opportunities snapshot
let latestOpportunities = { timestamp: null, items: [] };
export function getLatestOpportunities() {
  return latestOpportunities;
}

// Helpers: estimate effective fill price and slippage
function estimateFillPrice(levels, qty) {
  if (!Array.isArray(levels) || levels.length === 0 || !qty || qty <= 0) {
    return { effectivePrice: null, filled: 0, slippageAbs: null };
  }
  let remaining = qty;
  let cost = 0;
  let filled = 0;
  const top = levels[0]?.price ?? null;
  for (const { price, amount } of levels) {
    const take = Math.min(remaining, amount || 0);
    if (take <= 0) continue;
    cost += (price || 0) * take;
    filled += take;
    remaining -= take;
    if (remaining <= 0) break;
  }
  if (filled <= 0) {
    return { effectivePrice: null, filled: 0, slippageAbs: null };
  }
  const effectivePrice = cost / filled;
  const slippageAbs = top != null ? Math.abs(effectivePrice - top) : null;
  return { effectivePrice, filled, slippageAbs };
}

// Compute opportunities from aggregated symbol data
function computeOpportunitiesFromAllData(allData, tradeSizeUSDT = Number(process.env.TRADE_SIZE_USDT ?? 25)) {
  const items = [];
  const exchangesList = Object.keys(exchanges);
  const minRawSpreadPct = Number(process.env.MIN_RAW_SPREAD_PCT ?? 0); // show any positive spread by default
  const minTradeUSDT = Number(process.env.MIN_TRADE_USDT ?? 1); // allow small notionals by default

  // Debug counters
  let pairsChecked = 0;
  let pairsMissingOB = 0;
  let pairsInsufficientFill = 0;
  let pairsBelowSpread = 0;
  let pairsBelowNotional = 0;
  let pairsLimitsFail = 0;

  for (const symbol of Object.keys(allData || {})) {
    const perExchange = allData[symbol];
    // Collect candidates only when both sides have valid data
    for (let i = 0; i < exchangesList.length; i++) {
      for (let j = 0; j < exchangesList.length; j++) {
        if (i === j) continue;
        const buyEx = exchangesList[i];
        const sellEx = exchangesList[j];
        const buyData = perExchange[buyEx];
        const sellData = perExchange[sellEx];
        if (!buyData || !sellData || buyData.error || sellData.error) continue;

        pairsChecked++;

        const buyAsk = buyData.orderbook?.asks?.[0]?.price;
        const sellBid = sellData.orderbook?.bids?.[0]?.price;
        if (!buyAsk || !sellBid) { pairsMissingOB++; continue; }

        // Intended quantity from USDT size using buy price
        const intendedQty = tradeSizeUSDT / buyAsk;

        // Slippage estimates for intended quantity
        const buyFill = estimateFillPrice(buyData.orderbook?.asks || [], intendedQty);
        const sellFill = estimateFillPrice(sellData.orderbook?.bids || [], intendedQty);
        const qtyEff = Math.min(buyFill.filled || 0, sellFill.filled || 0);
        if (qtyEff <= 0) { pairsInsufficientFill++; continue; }

        const buyEffective = buyFill.effectivePrice;
        const sellEffective = sellFill.effectivePrice;
        if (!buyEffective || !sellEffective) { pairsMissingOB++; continue; }

        // Raw spreads
        const spreadAbs = sellEffective - buyEffective;
        const spreadPct = (spreadAbs / buyEffective) * 100;
        const notionalBuy = buyEffective * qtyEff;
        if (spreadPct <= minRawSpreadPct) { pairsBelowSpread++; continue; }
        if (notionalBuy < minTradeUSDT) { pairsBelowNotional++; continue; }

        // Fees
        const takerBuy = buyData.fees?.taker ?? 0;
        const takerSell = sellData.fees?.taker ?? 0;
        const tradingFeesAbs = (qtyEff * buyEffective * takerBuy) + (qtyEff * sellEffective * takerSell);

        // Assume pre-funded balances; exclude transfer fees in real-time cross-exchange arbitrage
        const networkFeesAbs = 0;

        // Net profit
        const grossProfitAbs = spreadAbs * qtyEff;
        const netProfitAbs = grossProfitAbs - (tradingFeesAbs + networkFeesAbs);
        const netProfitPct = (netProfitAbs / (buyEffective * qtyEff)) * 100;

        // Liquidity estimates from top levels
        const buyLiquidity = (buyData.orderbook?.asks || []).reduce((s, l) => s + (l.amount || 0), 0);
        const sellLiquidity = (sellData.orderbook?.bids || []).reduce((s, l) => s + (l.amount || 0), 0);
        const availableLiquidity = Math.min(buyLiquidity, sellLiquidity);

        const limits = {
          buy: {
            minAmount: buyData.limits?.minAmount,
            maxAmount: buyData.limits?.maxAmount,
            minCost: buyData.limits?.minCost,
            maxCost: buyData.limits?.maxCost,
          },
          sell: {
            minAmount: sellData.limits?.minAmount,
            maxAmount: sellData.limits?.maxAmount,
            minCost: sellData.limits?.minCost,
            maxCost: sellData.limits?.maxCost,
          }
        };

        const opportunity = {
          symbol,
          buyExchange: buyEx,
          sellExchange: sellEx,
          buyPrice: buyAsk,
          sellPrice: sellBid,
          buyEffective,
          sellEffective,
          quantity: qtyEff,
          volume24h: Math.min(buyData.price?.volume || 0, sellData.price?.volume || 0),
          spreadAbs,
          spreadPct,
          fees: {
            tradingAbs: tradingFeesAbs,
            networkAbs: networkFeesAbs,
            takerBuy,
            takerSell,
          },
          slippage: {
            buyAbs: buyFill.slippageAbs,
            sellAbs: sellFill.slippageAbs,
          },
          netProfitAbs,
          netProfitPct,
          liquidity: availableLiquidity,
          buyLiquidity,
          sellLiquidity,
          limits,
          estimates: {
            confidenceScore: (() => {
              const slip = (buyFill.slippageAbs || 0) + (sellFill.slippageAbs || 0);
              const slipScore = Math.max(0, 1 - Math.min(slip / buyEffective, 0.02)); // cap at 2%
              const liqScore = Math.min(1, availableLiquidity / (qtyEff * 10));
              const feeScore = Math.max(0, 1 - Math.min(tradingFeesAbs / grossProfitAbs, 0.9));
              return Number((0.5 * slipScore + 0.3 * liqScore + 0.2 * feeScore).toFixed(3));
            })(),
          },
          risk: {
            marketVolatility: Math.abs((buyData.price?.priceChangePercent || 0) - (sellData.price?.priceChangePercent || 0)),
            executionRisk: Number(((buyFill.slippageAbs || 0) + (sellFill.slippageAbs || 0)).toFixed(8)),
            liquidityRisk: Number((qtyEff > availableLiquidity ? 1 : Math.max(0, 1 - availableLiquidity / (qtyEff * 5))).toFixed(3)),
            feeRisk: Number((tradingFeesAbs / Math.max(grossProfitAbs, 1e-9)).toFixed(6)),
          },
          ts: Date.now(),
        };

        const minAmtOk = (!limits.buy.minAmount || qtyEff >= limits.buy.minAmount) && (!limits.sell.minAmount || qtyEff >= limits.sell.minAmount);
        const maxAmtOk = (!limits.buy.maxAmount || qtyEff <= limits.buy.maxAmount) && (!limits.sell.maxAmount || qtyEff <= limits.sell.maxAmount);
        const minCostOk = (!limits.buy.minCost || notionalBuy >= limits.buy.minCost) && (!limits.sell.minCost || (sellEffective * qtyEff) >= limits.sell.minCost);
        const maxCostOk = (!limits.buy.maxCost || notionalBuy <= limits.buy.maxCost) && (!limits.sell.maxCost || (sellEffective * qtyEff) <= limits.sell.maxCost);

        if (minAmtOk && maxAmtOk && minCostOk && maxCostOk) {
          items.push(opportunity);
        } else {
          pairsLimitsFail++;
        }
      }
    }
  }

  // Sort by raw spread percentage to surface strongest price gaps first
  items.sort((a, b) => b.spreadPct - a.spreadPct);

  if (ARB_DEBUG) {
    console.log(`[ArbDebug] pairsChecked=${pairsChecked} missingOB=${pairsMissingOB} insufficientFill=${pairsInsufficientFill} belowSpread=${pairsBelowSpread} belowNotional=${pairsBelowNotional} limitsFail=${pairsLimitsFail}`);
  }

  return items;
}

// Updated polling to handle multiple symbols
async function startMultiSymbolPolling(interval = Number(process.env.SCAN_INTERVAL_MS ?? 3000)) {
  console.log('Initiating multi-symbol polling...');
  io.emit('scanLog', 'Initiating multi-symbol polling...');
  let symbols;
  try {
    symbols = await getCommonUSDTSymbols();
  } catch (err) {
    console.warn(`[startMultiSymbolPolling] getCommonUSDTSymbols failed: ${err.message}.`);
    io.emit('scanLog', `[startMultiSymbolPolling] getCommonUSDTSymbols failed: ${err.message}.`);
    symbols = [];
  }
  if (!symbols || symbols.length === 0) {
    console.error('No common USDT symbols found across exchanges. Aborting polling until real data is available.');
    io.emit('scanLog', 'No common USDT symbols found across exchanges. Aborting polling until real data is available.');
    return;
  }
  const allSymbols = symbols;

  // Allow restricting exchanges via env (e.g., 'kucoin,bybit,mexc,gate')
  const configuredEx = (process.env.SCAN_EXCHANGES || '').split(',').map(s => s.trim()).filter(Boolean);
  const scanExchanges = configuredEx.length > 0 ? configuredEx : Object.keys(exchanges);
  console.log('Scanning exchanges:', scanExchanges);
  io.emit('scanLog', `Scanning exchanges: ${JSON.stringify(scanExchanges)}`);
  console.log('Total symbols to scan:', allSymbols.length);
  io.emit('scanLog', `Total symbols to scan: ${allSymbols.length}`);

  const tradeSizeUSDT = Number(process.env.TRADE_SIZE_USDT ?? 25);
  const batchSize = Number(process.env.SCAN_BATCH_SIZE ?? 30);
  let scanIndex = 0;

  const poll = async () => {
    const start = scanIndex;
    const end = Math.min(scanIndex + batchSize, allSymbols.length);
    const batch = allSymbols.slice(start, end);
    if (end >= allSymbols.length) {
      scanIndex = 0;
    } else {
      scanIndex = end;
    }
    console.log(`[Scan] Processing symbols ${start}..${end - 1} of ${allSymbols.length}`);
    io.emit('scanLog', `[Scan] Processing symbols ${start}..${end - 1} of ${allSymbols.length}`);

    const allData = {};
    for (const symbol of batch) {
      const symbolData = {};
      for (const name of scanExchanges) {
        try {
          const data = await fetchTradingPairData(name, symbol);
          if (data && !data.error && data.orderbook && data.price) {
            symbolData[name] = data;
          }
        } catch (err) {
          console.warn(`[poll] fetchTradingPairData failed for ${name} ${symbol}: ${err.message}. Skipping.`);
          io.emit('scanLog', `[poll] fetchTradingPairData failed for ${name} ${symbol}: ${err.message}. Skipping.`);
        }
      }
      if (Object.keys(symbolData).length > 0) {
        allData[symbol] = symbolData;
      }
    }
    latestSnapshot = { timestamp: Date.now(), data: allData };
    const opps = computeOpportunitiesFromAllData(allData, tradeSizeUSDT);
    latestOpportunities = { timestamp: Date.now(), items: opps };
    console.log(`[Arb] Batch ${start}-${end - 1}: computed ${opps.length} opportunities`);
    io.emit('scanLog', `[Arb] Batch ${start}-${end - 1}: computed ${opps.length} opportunities`);
    io.emit('opportunityUpdate', opps);
    if (opps.length > 0) {
      for (const o of opps.slice(0, 20)) {
        console.log(`[Arb] ${o.symbol} ${o.buyExchange} -> ${o.sellExchange} | spread=${o.spreadPct?.toFixed(3)}% net=${o.netProfitPct?.toFixed(3)}% qty=${o.quantity?.toFixed(6)}`);
        io.emit('scanLog', `[Arb] ${o.symbol} ${o.buyExchange} -> ${o.sellExchange} | spread=${o.spreadPct?.toFixed(3)}% net=${o.netProfitPct?.toFixed(3)}% qty=${o.quantity?.toFixed(6)}`);
      }
    }
  };

  await poll();
  setInterval(poll, interval);
}

export { fetchMarketData, fetchOrderBook, fetchFees, fetchBalance, createOrder, withdraw, startPricePolling, fetchTradingPairData, getUSDTSpotSymbols, getCommonUSDTSymbols, startMultiSymbolPolling };