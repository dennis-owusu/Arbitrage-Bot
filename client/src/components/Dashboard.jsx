import React, { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { Alert, AlertDescription } from '../components/ui/alert';

export function Dashboard() {
  const [opportunities, setOpportunities] = useState([]);
  const [incomingOpps, setIncomingOpps] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const latestRef = useRef([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Remove frontend filters & persistence. Backend now owns min/max net and TTL.

  useEffect(() => {
    let mounted = true;
    async function fetchOpps() {
      try {
        const res = await fetch('/api/opportunities');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (mounted && Array.isArray(data.items)) {
          setOpportunities(data.items);
          setIncomingOpps(data.items);
          setLastUpdated(new Date());
          setLoading(false);
        }
      } catch (e) {
        console.error('Failed to fetch opportunities', e);
        setError('Failed to load opportunities');
        setLoading(false);
      }
    }

    fetchOpps();

    const socket = io();
    socket.on('opportunityUpdate', (opps) => {
      const arr = Array.isArray(opps) ? opps : [];
      setIncomingOpps(arr);
      setOpportunities(arr);
      setLastUpdated(new Date());
      setError(null);
    });

    socket.on('connect', () => setError(null));
    socket.on('error', () => setError('Connection error'));
    socket.on('disconnect', () => setError('Connection lost'));

    return () => {
      mounted = false;
      socket.disconnect();
    };
  }, []);

  useEffect(() => { latestRef.current = incomingOpps; }, [incomingOpps]);

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="bg-card border-border">
              <CardHeader>
                <Skeleton className="h-4 w-24 bg-muted" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32 bg-muted mb-2" />
                <Skeleton className="h-4 w-48 bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="animate-fade-in">
        <Alert variant="destructive" className="border-destructive bg-destructive/10">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const items = opportunities;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Tradable Arbitrage Opportunities</h2>
        <div className="flex items-center gap-4">
          <div className="text-sm text-muted-foreground">
            {items.length} items
          </div>
        </div>
      </div>
      {lastUpdated && (
        <div className="text-xs text-muted-foreground">Last update: {new Date(lastUpdated).toLocaleTimeString()}</div>
      )}

      {items.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No tradable opportunities detected yet. Backend filters may be strict right now.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="px-3 py-2">Asset Pair</th>
                <th className="px-3 py-2">Buy Exchange</th>
                <th className="px-3 py-2">Buy Price</th>
                <th className="px-3 py-2">Sell Exchange</th>
                <th className="px-3 py-2">Sell Price</th>
                <th className="px-3 py-2">Spread %</th>
                <th className="px-3 py-2">Net Profit %</th>
                <th className="px-3 py-2">Volume 24h</th>
                <th className="px-3 py-2">Liquidity (buy/sell)</th>
                <th className="px-3 py-2">Fees (trade/network)</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx} className="border-t border-border hover:bg-accent/50">
                  <td className="px-3 py-2 text-foreground">{item.symbol}</td>
                  <td className="px-3 py-2 text-foreground">{item.buyExchange}</td>
                  <td className="px-3 py-2 text-foreground">{item.buyPrice?.toFixed(6)}</td>
                  <td className="px-3 py-2 text-foreground">{item.sellExchange}</td>
                  <td className="px-3 py-2 text-foreground">{item.sellPrice?.toFixed(6)}</td>
                  <td className="px-3 py-2 text-foreground">{item.spreadPct?.toFixed(2)}%</td>
                  <td className="px-3 py-2 text-foreground">{item.netProfitPct?.toFixed(2)}%</td>
                  <td className="px-3 py-2 text-muted-foreground">{(item.volume24h ?? 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-muted-foreground">{(item.buyLiquidity ?? item.liquidity ?? 0)?.toFixed(4)} / {(item.sellLiquidity ?? item.liquidity ?? 0)?.toFixed(4)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{item.fees?.tradingAbs?.toFixed(6)} / {item.fees?.networkAbs?.toFixed(6)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}