import ModelClient, { isUnexpected } from '@azure-rest/ai-inference';
import { AzureKeyCredential } from '@azure/core-auth';
import { getLatestSnapshot, getLatestOpportunities } from './exchangeService.js';

export async function callAiWithMarketContext(userMessage = 'Analyze arbitrage opportunities', options = {}) {
  const token = process.env.GITHUB_GPT5_API_KEY;
  if (!token) {
    throw new Error('Missing GITHUB_GPT5_API_KEY');
  }
  const endpoint = process.env.GITHUB_ENDPOINT || 'https://models.github.ai/inference';
  const initialModel = process.env.GITHUB_MODEL || 'openai/gpt-5-nano';
  const fallbackEnv = process.env.GITHUB_MODEL_FALLBACKS || 'openai/gpt-4o-mini,openai/gpt-4o';
  const fallbackModels = fallbackEnv.split(',').map((s) => s.trim()).filter(Boolean);

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
      buyLiquidity: o.buyLiquidity ?? o.liquidity,
      sellLiquidity: o.sellLiquidity ?? o.liquidity,
      buyPrice: o.buyPrice,
      sellPrice: o.sellPrice,
      fees: {
        tradingAbs: o?.fees?.tradingAbs,
        networkAbs: o?.fees?.networkAbs,
      },
      slippage: {
        buyAbs: o?.slippage?.buyAbs,
        sellAbs: o?.slippage?.sellAbs,
      },
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

  const systemPrompt = `You are Crypto Arbitrage AI Trader. Analyze the provided market context and list the best arbitrage opportunities based solely on net profit, fees, and slippage considerations. Do not enforce additional volume/liquidity constraints. Provide accurate, actionable recommendations.`;

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

  function extractErrorMessage(errBody) {
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
    return msg;
  }

  async function postWithModel(modelName) {
    return client.path('/chat/completions').post({
      body: {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
          { role: 'user', content: `MARKET_CONTEXT_JSON: ${JSON.stringify(context)}` },
        ],
        model: modelName,
        temperature: options.temperature ?? 0.2,
      },
    });
  }

  const candidates = [initialModel, ...fallbackModels];
  let response;
  let usedModel = initialModel;
  let lastErrMsg = null;

  for (const m of candidates) {
    try {
      const r = await postWithModel(m);
      if (isUnexpected(r)) {
        const msg = extractErrorMessage(r?.body);
        lastErrMsg = msg;
        if ((msg || '').toLowerCase().includes('unavailable model')) {
          continue;
        }
        throw new Error(msg);
      }
      response = r;
      usedModel = m;
      break;
    } catch (err) {
      lastErrMsg = err?.message || String(err);
      continue;
    }
  }

  if (!response) {
    throw new Error(lastErrMsg || 'AI model request failed');
  }

  const content = response.body?.choices?.[0]?.message?.content ?? '';
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = { raw: content };
  }

  return { model: usedModel, result: parsed };
}

export default { callAiWithMarketContext };