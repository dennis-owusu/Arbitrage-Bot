import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { Skeleton } from '../components/ui/skeleton';
import { Alert, AlertDescription } from '../components/ui/alert';

export default function TradingView() {
  const [opportunities, setOpportunities] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [netProfitThreshold, setNetProfitThreshold] = useState(1.5);
  const latestRef = useRef([]);

  useEffect(() => {
    let mounted = true;
    async function fetchOpps() {
      try {
        const res = await fetch('/api/opportunities');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (mounted && Array.isArray(data.items)) {
          setOpportunities(data.items);
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

  useEffect(() => { 
    latestRef.current = opportunities; 
  }, [opportunities]);

  // Helper to determine reasons an item is hidden
  function getHiddenReasons(item, threshold) {
    const reasons = [];
    if (!item) return ['No item'];
    const net = Number(item?.netProfitPct ?? 0);
    if (Number.isFinite(net) && net < threshold) {
      reasons.push(`Net profit ${net.toFixed(2)}% below threshold ${threshold}%`);
    }
    if (item?.available === false) {
      const dep = item?.buyTransfer?.depositEnabled;
      const wdr = item?.sellTransfer?.withdrawEnabled;
      if (dep === false) reasons.push('Deposit disabled on buy exchange');
      if (wdr === false) reasons.push('Withdrawal disabled on sell exchange');
      reasons.push('Transferability unavailable');
    }
    if (item?.isTradable === false) reasons.push('Not tradable on spot');
    if (item?.marketActive === false) reasons.push('Market inactive or under maintenance');
    if (!item?.buyPrice || !item?.sellPrice) reasons.push('Missing price data');
    const buyLiq = Number(item?.buyLiquidity ?? 0);
    const sellLiq = Number(item?.sellLiquidity ?? 0);
    if (buyLiq < 1_000_000 || sellLiq < 1_000_000) reasons.push('Insufficient liquidity (< $1M)');
    const vol = Number(item?.volume24h ?? 0);
    if (vol < 1_000_000) reasons.push('Low 24h volume (< $1M)');
    return reasons;
  }

  // Derive displayed and hidden lists with reasons and sort by net profit
  const displayed = (opportunities || [])
    .filter((item) => getHiddenReasons(item, netProfitThreshold).length === 0)
    .sort((a, b) => Number(b?.netProfitPct ?? 0) - Number(a?.netProfitPct ?? 0));
  
  const hidden = (opportunities || [])
    .map((item) => ({ item, reasons: getHiddenReasons(item, netProfitThreshold) }))
    .filter((x) => x.reasons.length > 0);

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-md p-4">
              <Skeleton className="h-4 w-24 bg-muted mb-3" />
              <Skeleton className="h-8 w-32 bg-muted mb-2" />
              <Skeleton className="h-4 w-48 bg-muted" />
            </div>
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
        <h2 className="text-2xl font-bold text-foreground">Live Trading Opportunities</h2>
        <div className="flex items-center gap-4">
          <div className="text-sm text-muted-foreground">
            {displayed.length} items ≥ {netProfitThreshold}% net
          </div>
        </div>
      </div>
      
      {lastUpdated && (
        <div className="text-xs text-muted-foreground">Last update: {new Date(lastUpdated).toLocaleTimeString()}</div>
      )}

      {/* Net profit threshold control */}
      <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
        <label className="font-medium text-foreground">Net profit threshold (%)</label>
        <input
          type="range"
          min={0}
          max={10}
          step={0.1}
          value={netProfitThreshold}
          onChange={(e) => setNetProfitThreshold(Number(e.target.value))}
          className="w-48"
        />
        <input
          type="number"
          min={0}
          max={100}
          step={0.1}
          value={netProfitThreshold}
          onChange={(e) => setNetProfitThreshold(Number(e.target.value))}
          className="w-20 px-2 py-1 border border-border rounded"
        />
        <span className="text-sm text-muted-foreground">(Default 1.5%)</span>
      </div>

      {displayed.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No opportunities with ≥ {netProfitThreshold}% net profit currently available.</p>
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
              {displayed.map((item, idx) => (
                <tr key={idx} className="border-t border-border hover:bg-accent/50">
                  <td className="px-3 py-2 text-foreground">{item.symbol}</td>
                  <td className="px-3 py-2 text-foreground">{item.buyExchange}</td>
                  <td className="px-3 py-2 text-foreground">{item.buyPrice?.toFixed(6)}</td>
                  <td className="px-3 py-2 text-foreground">{item.sellExchange}</td>
                  <td className="px-3 py-2 text-foreground">{item.sellPrice?.toFixed(6)}</td>
                  <td className="px-3 py-2 text-foreground">{item.spreadPct?.toFixed(2)}%</td>
                  <td className="px-3 py-2 text-foreground">{item.netProfitPct?.toFixed(2)}%</td>
                  <td className="px-3 py-2 text-muted-foreground">{(item.volume24h ?? 0).toLocaleString()}</td>
                  <td className="px-3 py-2 text-muted-foreground">{(item.buyLiquidity ?? item.liquidity ?? 0)?.toLocaleString()} / {(item.sellLiquidity ?? item.liquidity ?? 0)?.toLocaleString()}</td>
                  <td className="px-3 py-2 text-muted-foreground">{item.fees?.tradingAbs?.toFixed(6) ?? '-'} / {item.fees?.networkAbs?.toFixed(6) ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Hidden reasons inspector */}
      <details className="mt-4">
        <summary className="cursor-pointer font-medium text-foreground">
          Filtered out opportunities: {hidden.length}
        </summary>
        <div className="mt-2">
          {hidden.length === 0 ? (
            <div className="text-green-600">None hidden. All visible meet your criteria.</div>
          ) : (
            <ul className="list-disc pl-5">
              {hidden.map(({ item, reasons }, idx) => (
                <li key={idx} className="mb-2">
                  <div className="font-semibold">
                    {item?.symbol} | {item?.buyExchange} → {item?.sellExchange}
                  </div>
                  <div className="text-muted-foreground">
                    {reasons.map((r, i) => (
                      <span key={i}>
                        {r}
                        {i < reasons.length - 1 ? '; ' : ''}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </div>
  );
}