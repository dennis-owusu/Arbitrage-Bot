import { fetchTradingPairData, getCommonUSDTSymbols } from './src/services/exchangeService.js';

async function testFetch() {
  const exchanges = ['binance', 'kucoin', 'gate'];
  const symbols = await getCommonUSDTSymbols();

  console.log(`Found ${symbols.length} common USDT symbols across at least 2 exchanges.`);

  // Limit to first 5 symbols for testing to avoid overwhelming output
  const testSymbols = symbols.slice(0, 5);

  for (const symbol of testSymbols) {
    console.log(`\nFetching data for ${symbol}:`);
    for (const exchangeName of exchanges) {
      try {
        const data = await fetchTradingPairData(exchangeName, symbol);
        if (!data.error) {
          console.log(`Data for ${exchangeName}:`);
          console.log(JSON.stringify(data, null, 2));
        } else {
          console.log(`Skipping ${exchangeName} for ${symbol}: ${data.error}`);
        }
      } catch (error) {
        console.error(`Error fetching for ${exchangeName} - ${symbol}: ${error.message}`);
      }
    }
  }
}

testFetch().catch(console.error);