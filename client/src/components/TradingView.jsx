import React, { useState, useEffect, useMemo, useRef } from 'react';
import { io } from 'socket.io-client';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { Alert, AlertDescription } from '../components/ui/alert';

export function TradingView() {
  const [items, setItems] = useState([]);
  const [incomingItems, setIncomingItems] = useState([]);
  const [refreshMs, setRefreshMs] = useState(30000);
  const latestRef = useRef([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortKey, setSortKey] = useState('netProfitPct');
  const [sortDir, setSortDir] = useState('desc');

  // New configurable filters & persistence
  const [minNetPct, setMinNetPct] = useState(() => Number(localStorage.getItem('tv_minNetPct') ?? 1));
  const [maxNetPct, setMaxNetPct] = useState(() => Number(localStorage.getItem('tv_maxNetPct') ?? 50));
  const [persistItems, setPersistItems] = useState(() => localStorage.getItem('tv_persistItems') === 'true');
  const [persistedMap, setPersistedMap] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tv_persistedOpps') || '{}'); } catch { return {}; }
  });

  useEffect(() => { localStorage.setItem('tv_minNetPct', String(minNetPct)); }, [minNetPct]);
  useEffect(() => { localStorage.setItem('tv_maxNetPct', String(maxNetPct)); }, [maxNetPct]);
  useEffect(() => { localStorage.setItem('tv_persistItems', String(persistItems)); }, [persistItems]);
  useEffect(() => { localStorage.setItem('tv_persistedOpps', JSON.stringify(persistedMap)); }, [persistedMap]);

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

  useEffect(() => { latestRef.current = incomingItems; }, [incomingItems]);

  useEffect(() => {
    const id = setInterval(() => {
      const latest = latestRef.current || [];
      const mergedMap = { ...persistedMap };
      for (const o of latest) {
        const key = `${o.symbol}-${o.buyExchange}-${o.sellExchange}`;
        const prev = mergedMap[key];
        if (!prev || (o.netProfitPct ?? 0) > (prev.netProfitPct ?? 0)) {
          mergedMap[key] = o;
        } else if (!persistItems) {
          mergedMap[key] = o;
        }
      }
      const merged = Object.values(mergedMap);
      setPersistedMap(mergedMap);
      setItems(persistItems ? merged : latest);
      setLoading(false);
    }, refreshMs);
    return () => clearInterval(id);
  }, [refreshMs, persistItems, persistedMap]);

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
      return net >= minNetPct && net <= maxNetPct && spread <= 20 && vol > 0 && buyLiq >= qty * 2 && sellLiq >= qty * 2 && slipPct <= 0.2;
    });
  }, [items, minNetPct, maxNetPct]);

  const sorted = useMemo(() => {
    const key = sortKey;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = a?.[key] ?? 0;
      const vb = b?.[key] ?? 0;
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

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

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Trading View</h2>
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
          <label className="text-sm text-muted-foreground flex items-center gap-2">
            Min Net %:
            <input
              type="number"
              className="bg-background border border-border rounded px-2 py-1 w-20 text-foreground"
              value={minNetPct}
              onChange={(e) => setMinNetPct(Number(e.target.value))}
              min={0}
              step={0.1}
            />
          </label>
          <label className="text-sm text-muted-foreground flex items-center gap-2">
            Max Net %:
            <input
              type="number"
              className="bg-background border border-border rounded px-2 py-1 w-20 text-foreground"
              value={maxNetPct}
              onChange={(e) => setMaxNetPct(Number(e.target.value))}
              min={1}
              step={0.1}
            />
          </label>
          <label className="text-sm text-muted-foreground flex items-center gap-2">
            Persist items
            <input
              type="checkbox"
              checked={persistItems}
              onChange={(e) => setPersistItems(e.target.checked)}
            />
          </label>
          <div className="text-sm text-muted-foreground">{sorted.length} items</div>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No tradable opportunities yet. Adjust net % thresholds or enable persistence.</p>
        </div>
      ) : (
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
              </tr>
            </thead>
            <tbody>
              {sorted.map((item, idx) => (
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