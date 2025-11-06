import ModelClient, { isUnexpected } from '@azure-rest/ai-inference';
import { AzureKeyCredential } from '@azure/core-auth';
import { getLatestSnapshot, getLatestOpportunities } from './exchangeService.js';

export async function callAiWithMarketContext(userMessage = 'Analyze arbitrage opportunities', options = {}) {
  const token = process.env.GITHUB_GPT5_API_KEY;
  if (!token) {
    throw new Error('Missing GITHUB_GPT5_API_KEY');
  }
  const endpoint = process.env.GITHUB_ENDPOINT || 'https://models.github.ai/inference';
  const model = process.env.GITHUB_MODEL || 'openai/gpt-5-nano';

  const client = ModelClient(endpoint, new AzureKeyCredential(token));

  const snapshot = getLatestSnapshot();
  const opps = getLatestOpportunities();

  // Trim context to stay well under token limits
  const maxOpps = Number(process.env.AI_MAX_OPPS ?? 20);
  const maxSymbols = Number(process.env.AI_MAX_SYMBOLS ?? 30);

  function slimOpportunities(items = []) {
    const sorted = [...items].sort((a, b) => (b?.netProfitPct ?? 0) - (a?.netProfitPct ?? 0));
    return sorted.slice(0, maxOpps).map((o) => ({
      symbol: o.symbol,
      buyExchange: o.buyExchange,
      sellExchange: o.sellExchange,
      spreadPct: o.spreadPct,
      netProfitPct: o.netProfitPct,
      netProfitAbs: o.netProfitAbs,
      volume24h: o.volume24h,
      ts: o.ts,
    }));
  }

  function slimSnapshot(snap) {
    const data = snap?.data;
    if (!data) return {};
    const symbols = Object.keys(data);
    const trimmed = {};
    let count = 0;
    for (const sym of symbols) {
      if (count >= maxSymbols) break;
      const exMap = data[sym];
      if (!exMap) continue;
      const entries = Object.entries(exMap).slice(0, 2);
      trimmed[sym] = entries.map(([ex, d]) => ({
        ex,
        price: {
          last: d?.price?.last,
          bid: d?.price?.bid,
          ask: d?.price?.ask,
        },
        liquidity: {
          buy: d?.buyLiquidity ?? d?.liquidity,
          sell: d?.sellLiquidity ?? d?.liquidity,
        },
      }));
      count++;
    }
    return trimmed;
  }

  const systemPrompt = `You are Crypto Arbitrage AI Trader. Use provided trimmed market context to answer the user's question with precise, actionable arbitrage recommendations. Return a JSON response with keys: opportunities, profit_estimates, strategy, risks.`;

  const context = {
    timestamp: Date.now(),
    summary: {
      opportunityCount: Array.isArray(opps?.items) ? opps.items.length : 0,
      snapshotSymbolCount: Object.keys(snapshot?.data || {}).length,
      snapshotTs: snapshot?.timestamp,
    },
    opportunities: slimOpportunities(Array.isArray(opps?.items) ? opps.items : []),
    snapshot: slimSnapshot(snapshot),
  };

  const response = await client.path('/chat/completions').post({
    body: {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
        { role: 'user', content: `MARKET_CONTEXT_JSON: ${JSON.stringify(context)}` },
      ],
      model,
      temperature: options.temperature ?? 0.2,
    },
  });

  if (isUnexpected(response)) {
    const errBody = response?.body;
    let msg = 'Model error';
    if (errBody) {
      if (typeof errBody === 'string') {
        msg = errBody;
      } else if (typeof errBody.error === 'string') {
        msg = errBody.error;
      } else if (errBody.error?.message) {
        msg = errBody.error.message;
      } else if (errBody.message) {
        msg = errBody.message;
      } else {
        try {
          msg = JSON.stringify(errBody);
        } catch (_) {
          msg = '[unserializable model error]';
        }
      }
    }
    throw new Error(msg);
  }

  const content = response.body?.choices?.[0]?.message?.content ?? '';
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = { raw: content };
  }

  return { model, result: parsed };
}

export default { callAiWithMarketContext };