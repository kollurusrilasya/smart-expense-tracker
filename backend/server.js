/* ============================================================
   FINIA — backend/server.js
   ============================================================ */
require('dotenv').config();  /* MUST be first line */

const express = require('express');
const cors    = require('cors');
const path    = require('path');

const authRoutes   = require('./routes/auth');
const budgetRoutes = require('./routes/budget');
const { driver, verifyConnection, URI, USER } = require('./db');

const app  = express();
const PORT = process.env.PORT || 3001;

/* JWT_SECRET — accept any common variable name */
const JWT_SECRET = process.env.JWT_SECRET || process.env.JWTSECRET || process.env.JWT_KEY;

/* Allow requests from localhost (dev) and any Vercel deployment */
const allowedOrigins = [
  'http://localhost:3001',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  /\.vercel\.app$/,      /* any *.vercel.app domain */
  /\.onrender\.com$/,    /* render previews */
];
app.use(cors({
  origin: (origin, callback) => {
    /* Allow requests with no origin (mobile apps, curl, Postman) */
    if (!origin) return callback(null, true);
    const allowed = allowedOrigins.some(o =>
      typeof o === 'string' ? o === origin : o.test(origin)
    );
    if (allowed) return callback(null, true);
    /* Also allow if FRONTEND_URL env var matches */
    if (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL)
      return callback(null, true);
    callback(null, true); /* Allow all for now — tighten after confirming deployment */
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../frontend')));

app.use((req, _res, next) => {
  console.log(`[${new Date().toTimeString().slice(0,8)}] ${req.method} ${req.path}`);
  next();
});

app.use('/api/auth',   authRoutes);
app.use('/api/budget', budgetRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', db: URI, user: USER });
});

app.use((_req, res) => res.status(404).json({ message: 'Route not found' }));

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ message: err.message });
});

async function start() {
  /* Read all possible variable names and show exactly what was found */
  const uri  = process.env.NEO4J_URI  || process.env.NEO4J_URL  || '(not set)';
  const user = process.env.NEO4J_USER || process.env.NEO4J_USERNAME || process.env.USERNAME || '(not set)';
  const pass = process.env.NEO4J_PASSWORD || process.env.NEO4J_PASS || process.env.PASSWORD;
  const jwt  = process.env.JWT_SECRET || process.env.JWTSECRET || process.env.JWT_KEY;

  console.log('\n========================================');
  console.log('  FINIA — Smart Budget Tracker');
  console.log('========================================');
  console.log(`  NEO4J_URI      = ${uri}`);
  console.log(`  NEO4J_USER     = ${user}`);
  console.log(`  NEO4J_PASSWORD = ${pass  ? '✅ set' : '❌ NOT SET — check .env'}`);
  console.log(`  JWT_SECRET     = ${jwt   ? '✅ set' : '❌ NOT SET — check .env'}`);
  console.log('========================================\n');

  if (!pass) {
    console.error('❌ STOPPING: NEO4J_PASSWORD is not set in your .env file.');
    console.error('   Add this line to backend/.env:');
    console.error('   NEO4J_PASSWORD=your-password-here\n');
    process.exit(1);
  }

  if (!jwt) {
    console.error('❌ STOPPING: JWT_SECRET is not set in your .env file.');
    console.error('   Add this line to backend/.env:');
    console.error('   JWT_SECRET=any-long-random-string-here\n');
    process.exit(1);
  }

  let connected = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await verifyConnection();
      connected = true;
      break;
    } catch (e) {
      console.error(`  Attempt ${attempt}/3 failed: ${e.message}`);
      if (attempt < 3) {
        console.log('  Retrying in 3 seconds...');
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }

  if (!connected) {
    console.error('\n❌ Could not connect to Neo4j. Server will start but API calls will fail.');
    console.error('   Check your Aura credentials at: https://console.neo4j.io\n');
  }

  app.listen(PORT, () => {
    console.log(`🚀 Server running → http://localhost:${PORT}\n`);
  });
}

start();

process.on('SIGINT', async () => {
  await driver.close();
  process.exit(0);
});