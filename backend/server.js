import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import connectDB from './config/db.js';
import { Server } from 'socket.io';
import http from 'http';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import ModelClient, { isUnexpected } from '@azure-rest/ai-inference';
import { AzureKeyCredential } from '@azure/core-auth';
import { startMultiSymbolPolling, getLatestSnapshot, getLatestOpportunities } from './src/services/exchangeService.js';
import { callAiWithMarketContext } from './src/services/aiService.js';

// Load environment variables
dotenv.config();

// Validate required environment variables early
const requiredEnv = ['MONGO_URI'];
const missingRequired = requiredEnv.filter((k) => !process.env[k] || String(process.env[k]).trim() === '');
if (missingRequired.length) {
  console.error(`Missing required environment variables: ${missingRequired.join(', ')}`);
  console.error('Set these in your Render service Environment tab or a local .env file before starting.');
  process.exit(1);
}

// Provide visibility into optional environment variables used by the app
const optionalEnv = [
  // Service/runtime
  'PORT',
  // AI model server (GitHub Models via Azure REST)
  'GITHUB_GPT5_API_KEY',
  'GITHUB_ENDPOINT',
  'GITHUB_MODEL',
  'GITHUB_MODEL_FALLBACKS',
  // Arbitrage scanning & ranking
  'ARB_DEBUG',
  'TRADE_SIZE_USDT',
  'MIN_RAW_SPREAD_PCT',
  'MIN_TRADE_USDT',
  'SCAN_INTERVAL_MS',
  'SCAN_EXCHANGES',
  'SCAN_BATCH_SIZE',
  'OPP_ACTIVE_TTL_MS',
  'MIN_NET_PCT',
  'MAX_NET_PCT',
  // Exchange API credentials (optional for alerts; required for auto-trading)
  'BINANCE_API_KEY', 'BINANCE_SECRET_KEY',
  'KUCOIN_API_KEY', 'KUCOIN_SECRET_KEY', 'KUCOIN_PASSPHRASE',
  'GATEIO_API_KEY', 'GATEIO_SECRET_KEY',
  'BITGET_API_KEY', 'BITGET_SECRET_KEY',
  'MEXC_API_KEY', 'MEXC_SECRET_KEY',
  'BYBIT_API_KEY', 'BYBIT_SECRET_KEY',
];
console.log('Optional environment variables (configure as needed):', optionalEnv.join(', '));

// Connect to database
connectDB();

const app = express();
const PORT = process.env.PORT || 5001;

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
}));
const limiter = rateLimit({ 
  windowMs: 60 * 1000,
  max: 60, // 60 req/min per IP
});
app.use(limiter);

// Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Basic route for testing
app.get('/', (req, res) => {
  res.send('Backend server is running');
});

// Latest multi-symbol snapshot
app.get('/api/markets/snapshot', (req, res) => {
  const snap = getLatestSnapshot();
  if (!snap || !snap.data) {
    return res.status(503).json({ message: 'Snapshot not ready yet' });
  }
  res.json(snap);
});

// Latest computed opportunities
app.get('/api/opportunities', (req, res) => {
  const opps = getLatestOpportunities();
  if (!opps || !Array.isArray(opps.items)) {
    return res.status(503).json({ message: 'Opportunities not ready yet' });
  }
  res.json(opps);
});

// AI Chat: GPT-5 proxied via GitHub Models, enriched with current arbitrage context
app.post('/api/ai/chat', async (req, res) => {
  try {
    const userMessage = req.body?.message ?? 'Analyze arbitrage opportunities';
    const result = await callAiWithMarketContext(userMessage);
    return res.json(result);
  } catch (err) {
    console.error('AI chat error:', err);
    // Ensure error message is always a string
    const errorMessage = err instanceof Error ? err.message : JSON.stringify(err);
    return res.status(500).json({ error: errorMessage || 'AI chat error' });
  }
});

// Create HTTP server
const server = http.createServer(app);

// Integrate Socket.io
const io = new Server(server, {
  cors: {
    origin: '*', // Adjust for production
    methods: ['GET', 'POST']
  }
});

// Basic Socket.io connection handler
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  socket.emit('welcome', 'Welcome to the Arbitrage Trader WebSocket!');
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  startMultiSymbolPolling();
});

export { io };