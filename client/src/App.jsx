


import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { TradingView } from './components/TradingView';
import { AIBot } from './components/AIBot';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="trading" element={<TradingView />} />
        <Route path="ai" element={<AIBot />} />
      </Route> 
    </Routes>
  );
}

export default App;
