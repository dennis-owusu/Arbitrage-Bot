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