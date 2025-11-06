import ModelClient, { isUnexpected } from '@azure-rest/ai-inference';
import { AzureKeyCredential } from '@azure/core-auth';
import { getLatestSnapshot, getLatestOpportunities } from './exchangeService.js';

export async function callAiWithMarketContext(userMessage = 'Analyze arbitrage opportunities', options = {}) {
  const token = process.env.GITHUB_GPT5_API_KEY;
  if (!token) {
    throw new Error('Missing GITHUB_TOKEN');
  }
  const endpoint = process.env.GITHUB_ENDPOINT || 'https://models.github.ai/inference';
  const model = process.env.GITHUB_MODEL || 'openai/gpt-5-nano';

  const client = ModelClient(endpoint, new AzureKeyCredential(token));

  const snapshot = getLatestSnapshot();
  const opps = getLatestOpportunities();

  const systemPrompt = `You are Crypto Arbitrage AI Trader. Use provided JSON market context to answer the user's question with precise, actionable arbitrage recommendations. Return a JSON response with keys: opportunities, profit_estimates, strategy, risks.`;

  const context = {
    timestamp: Date.now(),
    snapshot,
    opportunities: Array.isArray(opps?.items) ? opps.items : [],
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
    throw new Error(response.body?.error || 'Model error');
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