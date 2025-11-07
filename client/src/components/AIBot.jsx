import React, { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import { Skeleton } from './ui/skeleton';

export function AIBot() {
  const [query, setQuery] = useState('Analyze current arbitrage opportunities and suggest the best execution plan.');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const MIN_VOL_USD = 1_000_000;
  const MIN_LIQ_USD = 1_000_000;

  async function sendMessage(e) {
    e?.preventDefault();
    setError(null);
    if (!query.trim()) return;
    const userMsg = { role: 'user', content: query };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: query }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const aiMsg = { role: 'ai', content: data?.result ?? data };
      setMessages((prev) => [...prev, aiMsg]);
      setQuery('');
    } catch (e) {
      console.error('AI chat failed', e);
      setError(e.message || 'AI chat failed');
    } finally {
      setLoading(false);
    }
  }

  function renderAIContent(content) {
    if (!content) return null;
    // If string, render as Markdown
    if (typeof content === 'string') {
      return (
        <div className="prose prose-invert max-w-none text-base">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
        </div>
      );
    }
    const { opportunities = [], strategy, risks, raw } = content;

    // Enforce display-only constraints for legitimacy
    const filtered = Array.isArray(opportunities)
      ? opportunities.filter((o) => {
          const vol = o?.volume24h ?? 0;
          const buyLiq = o?.buyLiquidity ?? o?.liquidity ?? 0;
          const sellLiq = o?.sellLiquidity ?? o?.liquidity ?? 0;
          return vol >= MIN_VOL_USD && buyLiq >= MIN_LIQ_USD && sellLiq >= MIN_LIQ_USD;
        })
      : [];

    return (
      <div className="space-y-6">
        {filtered.length > 0 ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-base font-semibold text-foreground">AI-Recommended Opportunities</h4>
              <div className="text-xs text-muted-foreground">Min Volume: ${MIN_VOL_USD.toLocaleString()} • Min Liquidity: ${MIN_LIQ_USD.toLocaleString()}</div>
            </div>
            <div className="overflow-x-auto rounded border border-border">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="px-3 py-2">Pair</th>
                    <th className="px-3 py-2">Buy Ex</th>
                    <th className="px-3 py-2">Buy Price</th>
                    <th className="px-3 py-2">Sell Ex</th>
                    <th className="px-3 py-2">Sell Price</th>
                    <th className="px-3 py-2">Spread %</th>
                    <th className="px-3 py-2">Net %</th>
                    <th className="px-3 py-2">Volume 24h</th>
                    <th className="px-3 py-2">Liquidity (buy/sell)</th>
                    <th className="px-3 py-2">Fees (trade/network)</th>
                    <th className="px-3 py-2">Slippage (buy/sell)</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 20).map((o, i) => (
                    <tr key={i} className="border-t border-border hover:bg-accent/50">
                      <td className="px-3 py-2 text-foreground">{o.symbol}</td>
                      <td className="px-3 py-2 text-foreground">{o.buyExchange}</td>
                      <td className="px-3 py-2 text-foreground">{typeof o.buyPrice === 'number' ? o.buyPrice.toFixed(6) : '-'}</td>
                      <td className="px-3 py-2 text-foreground">{o.sellExchange}</td>
                      <td className="px-3 py-2 text-foreground">{typeof o.sellPrice === 'number' ? o.sellPrice.toFixed(6) : '-'}</td>
                      <td className="px-3 py-2 text-foreground">{typeof o.spreadPct === 'number' ? `${o.spreadPct.toFixed(2)}%` : '-'}</td>
                      <td className="px-3 py-2 text-foreground">{typeof o.netProfitPct === 'number' ? `${o.netProfitPct.toFixed(2)}%` : '-'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{(o.volume24h ?? 0).toLocaleString()}</td>
                      <td className="px-3 py-2 text-muted-foreground">{(o.buyLiquidity ?? o.liquidity ?? 0)?.toLocaleString()} / {(o.sellLiquidity ?? o.liquidity ?? 0)?.toLocaleString()}</td>
                      <td className="px-3 py-2 text-muted-foreground">{o.fees?.tradingAbs != null ? o.fees.tradingAbs.toFixed(6) : '-'} / {o.fees?.networkAbs != null ? o.fees.networkAbs.toFixed(6) : '-'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{o.slippage?.buyAbs != null ? o.slippage.buyAbs.toFixed(6) : '-'} / {o.slippage?.sellAbs != null ? o.slippage.sellAbs.toFixed(6) : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No AI opportunities meet the volume/liquidity constraints yet.</div>
        )}

        {strategy && (
          <div>
            <h4 className="text-base font-semibold mb-1 text-foreground">Strategy</h4>
            <div className="prose prose-invert max-w-none text-base">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{strategy}</ReactMarkdown>
            </div>
          </div>
        )}

        {risks && (
          <div>
            <h4 className="text-base font-semibold mb-1 text-foreground">Risks</h4>
            <div className="prose prose-invert max-w-none text-base">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{risks}</ReactMarkdown>
            </div>
          </div>
        )}

        {raw && (
          <div>
            <h4 className="text-sm font-semibold mb-1 text-foreground">Model Notes</h4>
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">{raw}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-2xl text-foreground">AI Arbitrage Assistant</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={sendMessage} className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask the AI about high-confidence arbitrage opportunities..."
              className="flex-1"
            />
            <Button type="submit" disabled={loading}>{loading ? 'Thinking…' : 'Ask AI'}</Button>
          </form>
          {error && (
            <div className="mt-3">
              <Alert variant="destructive" className="border-destructive bg-destructive/10">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-3">
        {messages.length === 0 && (
          <Card className="bg-card border-border">
            <CardContent className="py-6">
              <div className="text-center text-muted-foreground">No conversation yet. Ask the AI to analyze live market data.</div>
            </CardContent>
          </Card>
        )}

        {messages.map((m, idx) => (
          <Card key={idx} className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">{m.role === 'user' ? 'You' : 'AI'}</CardTitle>
            </CardHeader>
            <CardContent>
              {m.role === 'ai' ? renderAIContent(m.content) : (
                <div className="prose prose-invert max-w-none text-base">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                </div>
              )}
            </CardContent>
          </Card>
        ))}

        {loading && (
          <Card className="bg-card border-border">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-6 w-32 bg-muted" />
                <Skeleton className="h-6 w-64 bg-muted" />
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default AIBot;