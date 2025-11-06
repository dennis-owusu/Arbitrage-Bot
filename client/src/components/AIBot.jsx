import React, { useState } from 'react';
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
    if (typeof content === 'string') {
      return <p className="text-sm text-foreground whitespace-pre-wrap">{content}</p>;
    }
    const { opportunities = [], profit_estimates, strategy, risks, raw } = content;
    return (
      <div className="space-y-4">
        {Array.isArray(opportunities) && opportunities.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-2 text-foreground">Recommended Opportunities</h4>
            <div className="overflow-x-auto rounded border border-border">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="px-3 py-2">Pair</th>
                    <th className="px-3 py-2">Buy</th>
                    <th className="px-3 py-2">Sell</th>
                    <th className="px-3 py-2">Spread %</th>
                    <th className="px-3 py-2">Net %</th>
                  </tr>
                </thead>
                <tbody>
                  {opportunities.slice(0, 10).map((o, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-foreground">{o.symbol}</td>
                      <td className="px-3 py-2 text-foreground">{o.buyExchange}</td>
                      <td className="px-3 py-2 text-foreground">{o.sellExchange}</td>
                      <td className="px-3 py-2 text-foreground">{typeof o.spreadPct === 'number' ? `${o.spreadPct.toFixed(2)}%` : '-'}</td>
                      <td className="px-3 py-2 text-foreground">{typeof o.netProfitPct === 'number' ? `${o.netProfitPct.toFixed(2)}%` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {profit_estimates && (
          <div>
            <h4 className="text-sm font-semibold mb-1 text-foreground">Profit Estimates</h4>
            <pre className="text-xs bg-muted text-muted-foreground rounded p-3 overflow-x-auto">{JSON.stringify(profit_estimates, null, 2)}</pre>
          </div>
        )}

        {strategy && (
          <div>
            <h4 className="text-sm font-semibold mb-1 text-foreground">Strategy</h4>
            <p className="text-sm text-foreground whitespace-pre-wrap">{strategy}</p>
          </div>
        )}

        {risks && (
          <div>
            <h4 className="text-sm font-semibold mb-1 text-foreground">Risks</h4>
            <p className="text-sm text-foreground whitespace-pre-wrap">{risks}</p>
          </div>
        )}

        {raw && (
          <div>
            <h4 className="text-sm font-semibold mb-1 text-foreground">Raw</h4>
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
          <CardTitle className="text-xl text-foreground">AI Arbitrage Assistant</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={sendMessage} className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask the AI about current arbitrage opportunities..."
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
                <p className="text-sm text-foreground whitespace-pre-wrap">{m.content}</p>
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