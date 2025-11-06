import React, { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import { Alert, AlertDescription } from '../components/ui/alert';

export function Dashboard() {
  const [opportunities, setOpportunities] = useState([]);
  const [incomingOpps, setIncomingOpps] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshMs, setRefreshMs] = useState(30000);
  const latestRef = useRef([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // New configurable filters & persistence
  const [minNetPct, setMinNetPct] = useState(() => Number(localStorage.getItem('minNetPct') ?? 1));
  const [maxNetPct, setMaxNetPct] = useState(() => Number(localStorage.getItem('maxNetPct') ?? 50));
  const [persistItems, setPersistItems] = useState(() => localStorage.getItem('persistItems') === 'true');
  const [persistedMap, setPersistedMap] = useState(() => {
    try { return JSON.parse(localStorage.getItem('persistedOpps') || '{}'); } catch { return {}; }
  });

  useEffect(() => { localStorage.setItem('minNetPct', String(minNetPct)); }, [minNetPct]);
  useEffect(() => { localStorage.setItem('maxNetPct', String(maxNetPct)); }, [maxNetPct]);
  useEffect(() => { localStorage.setItem('persistItems', String(persistItems)); }, [persistItems]);
  useEffect(() => { localStorage.setItem('persistedOpps', JSON.stringify(persistedMap)); }, [persistedMap]);

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
      setIncomingOpps(Array.isArray(opps) ? opps : []);
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

  useEffect(() => {
    const id = setInterval(() => {
      // Merge latest with persisted (keep best per symbol)
      const latest = latestRef.current || [];
      const mergedMap = { ...persistedMap };
      for (const o of latest) {
        const key = `${o.symbol}-${o.buyExchange}-${o.sellExchange}`;
        const prev = mergedMap[key];
        if (!prev || (o.netProfitPct ?? 0) > (prev.netProfitPct ?? 0)) {
          mergedMap[key] = o;
        } else if (!persistItems) {
          // If not persisting, update to latest regardless
          mergedMap[key] = o;
        }
      }
      const merged = Object.values(mergedMap);
      setPersistedMap(mergedMap);
      setOpportunities(persistItems ? merged : latest);
      setLastUpdated(new Date());
      setLoading(false);
    }, refreshMs);
    return () => clearInterval(id);
  }, [refreshMs, persistItems, persistedMap]);

  const filtered = useMemo(() => {
    return (opportunities || []).filter((item) => {
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
  }, [opportunities, minNetPct, maxNetPct]);

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
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Tradable Arbitrage Opportunities</h2>
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
          <div className="text-sm text-muted-foreground">
            {filtered.length} items
          </div>
        </div>
      </div>
      {lastUpdated && (
        <div className="text-xs text-muted-foreground">Last update: {new Date(lastUpdated).toLocaleTimeString()}</div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No tradable opportunities detected yet. Try lowering the minimum net % or enabling persistence.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.slice(0, 12).map((item, idx) => (
            <Card key={idx} className="bg-card border-border hover:bg-accent/50 transition-colors">
              <CardHeader>
                <CardTitle className="text-lg text-foreground">{item.symbol}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium text-foreground">{item.buyExchange} → {item.sellExchange}</p>
                      <p className="text-xs text-muted-foreground">Spread: {item.spreadAbs?.toFixed(6)} ({item.spreadPct?.toFixed(2)}%)</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">Net Profit</p>
                      <p className="text-sm font-semibold text-foreground">{item.netProfitAbs?.toFixed(6)} ({item.netProfitPct?.toFixed(2)}%)</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div className="space-y-0.5">
                      <p>Buy Price: <span className="text-foreground">{item.buyPrice?.toFixed(6)}</span></p>
                      <p>Sell Price: <span className="text-foreground">{item.sellPrice?.toFixed(6)}</span></p>
                      <p>Volume 24h: <span className="text-foreground">{(item.volume24h ?? 0).toLocaleString()}</span></p>
                    </div>
                    <div className="space-y-0.5">
                      <p>Liquidity (buy/sell): <span className="text-foreground">{(item.buyLiquidity ?? item.liquidity ?? 0)?.toFixed(4)} / {(item.sellLiquidity ?? item.liquidity ?? 0)?.toFixed(4)}</span></p>
                      <p>Fees (trading/network): <span className="text-foreground">{item.fees?.tradingAbs?.toFixed(6)} / {item.fees?.networkAbs?.toFixed(6)}</span></p>
                      <p>Slippage est.: <span className="text-foreground">{(((item.slippage?.buyAbs ?? 0) + (item.slippage?.sellAbs ?? 0)) / (item.buyEffective ?? item.buyPrice ?? 1) * 100).toFixed(3)}%</span></p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}