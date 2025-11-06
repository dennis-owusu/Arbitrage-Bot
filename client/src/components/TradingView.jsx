import React, { useState, useEffect, useMemo, useRef } from 'react';
import { io } from 'socket.io-client';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { Alert, AlertDescription } from '../components/ui/alert';

function sortItems(items, sortKey, sortDir) {
  const dir = sortDir === 'desc' ? -1 : 1;
  return [...items].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'string' && typeof bv === 'string') {
      return av.localeCompare(bv) * dir;
    }
    return (av - bv) * dir;
  });
}

export function TradingView() {
  const [items, setItems] = useState([]);
  const [incomingItems, setIncomingItems] = useState([]);
  const [refreshMs, setRefreshMs] = useState(30000);
  const latestRef = useRef([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortKey, setSortKey] = useState('netProfitPct');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => {
    let mounted = true;

    async function fetchOpps() {
      try {
        const res = await fetch('/api/opportunities');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (mounted && Array.isArray(data.items)) {
          setItems(data.items);
          setIncomingItems(data.items);
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
      setIncomingItems(Array.isArray(opps) ? opps : []);
      setError(null);
      // avoid rapid UI refresh; we'll update on an interval
    });

    socket.on('connect', () => setError(null));
    socket.on('error', () => setError('Connection error'));
    socket.on('disconnect', () => setError('Connection lost'));

    return () => {
      mounted = false;
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    latestRef.current = incomingItems;
  }, [incomingItems]);

  useEffect(() => {
    const id = setInterval(() => {
      setItems(latestRef.current);
      setLoading(false);
    }, refreshMs);
    return () => clearInterval(id);
  }, [refreshMs]);

  const filtered = useMemo(() => {
    return (items || []).filter((item) => {
      const net = item?.netProfitPct ?? 0;
      const spread = item?.spreadPct ?? 0;
      const vol = item?.volume24h ?? 0;
      const qty = item?.quantity ?? 0;
      const buyEff = item?.buyEffective ?? item?.buyPrice ?? 1;
      const slipAbs = (item?.slippage?.buyAbs ?? 0) + (item?.slippage?.sellAbs ?? 0);
      const slipPct = buyEff ? (slipAbs / buyEff) * 100 : 0;
      const buyLiq = item?.buyLiquidity ?? item?.liquidity ?? 0;
      const sellLiq = item?.sellLiquidity ?? item?.liquidity ?? 0;
      return net >= 1 && net <= 10 && spread <= 20 && vol > 0 && buyLiq >= qty * 2 && sellLiq >= qty * 2 && slipPct <= 0.2;
    });
  }, [items]);

  const sorted = useMemo(() => sortItems(filtered, sortKey, sortDir), [filtered, sortKey, sortDir]);

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="bg-card border-border">
            <CardHeader>
              <Skeleton className="h-6 w-32 bg-muted" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-40 w-full bg-muted" />
            </CardContent>
          </Card>
        ))}
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

  return (
    <div className="rounded-lg border border-border bg-card p-4 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold text-foreground">Arbitrage Opportunities</h3>
        <div className="flex items-center gap-4">
          <label className="text-sm text-muted-foreground flex items-center gap-2">
            Refresh:
            <select
              className="bg-background border border-border rounded px-2 py-1 text-foreground"
              value={refreshMs}
              onChange={(e) => setRefreshMs(Number(e.target.value))}
            >
              <option value={10000}>10s</option>
              <option value={30000}>30s</option>
              <option value={60000}>1 min</option>
              <option value={120000}>2 min</option>
              <option value={300000}>5 min</option>
            </select>
          </label>
          <div className="text-sm text-muted-foreground">{sorted.length} items</div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="px-3 py-2 cursor-pointer" onClick={() => toggleSort('symbol')}>Asset Pair</th>
              <th className="px-3 py-2 cursor-pointer" onClick={() => toggleSort('buyExchange')}>Buy Exchange</th>
              <th className="px-3 py-2 cursor-pointer" onClick={() => toggleSort('buyPrice')}>Buy Price</th>
              <th className="px-3 py-2 cursor-pointer" onClick={() => toggleSort('sellExchange')}>Sell Exchange</th>
              <th className="px-3 py-2 cursor-pointer" onClick={() => toggleSort('sellPrice')}>Sell Price</th>
              <th className="px-3 py-2 cursor-pointer" onClick={() => toggleSort('spreadPct')}>Spread %</th>
              <th className="px-3 py-2 cursor-pointer" onClick={() => toggleSort('netProfitPct')}>Net Profit %</th>
              <th className="px-3 py-2">Volume 24h</th>
              <th className="px-3 py-2">Liquidity (buy/sell)</th>
              <th className="px-3 py-2">Fees (trade/network)</th>
              <th className="px-3 py-2">Slippage est.</th>
              <th className="px-3 py-2 cursor-pointer" onClick={() => toggleSort('ts')}>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((item, idx) => {
              return (
                <tr key={idx}>
                  <td className="px-3 py-2 text-foreground">{item.symbol}</td>
                  <td className="px-3 py-2 text-foreground">{item.buyExchange}</td>
                  <td className="px-3 py-2 text-foreground">{item.buyPrice?.toFixed(6)}</td>
                  <td className="px-3 py-2 text-foreground">{item.sellExchange}</td>
                  <td className="px-3 py-2 text-foreground">{item.sellPrice?.toFixed(6)}</td>
                  <td className="px-3 py-2 text-foreground">{item.spreadPct?.toFixed(2)}%</td>
                  <td className="px-3 py-2 text-foreground">{item.netProfitPct?.toFixed(2)}%</td>
                  <td className="px-3 py-2 text-foreground">{(item.volume24h ?? 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-foreground">{(item.buyLiquidity ?? item.liquidity ?? 0)?.toFixed(4)} / {(item.sellLiquidity ?? item.liquidity ?? 0)?.toFixed(4)}</td>
                  <td className="px-3 py-2 text-foreground">{item.fees?.tradingAbs?.toFixed(6)} / {item.fees?.networkAbs?.toFixed(6)}</td>
                  <td className="px-3 py-2 text-foreground">{(((item.slippage?.buyAbs ?? 0) + (item.slippage?.sellAbs ?? 0)) / (item.buyEffective ?? item.buyPrice ?? 1) * 100).toFixed(3)}%</td>
                  <td className="px-3 py-2 text-muted-foreground">{new Date(item.ts).toLocaleTimeString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}