/* ============================================================
   FINIA — backend/server.js
   ============================================================ */
require('dotenv').config();  /* MUST be first line */

const express = require('express');
const cors    = require('cors');
const path    = require('path');

const authRoutes   = require('./routes/auth');
const budgetRoutes = require('./routes/budget');
const { driver, verifyConnection } = require('./db');

const app  = express();
const PORT = process.env.PORT || 3001;

/* ── Middleware ── */
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ── Serve frontend ── */
app.use(express.static(path.join(__dirname, '../frontend')));

/* ── Logger ── */
app.use((req, _res, next) => {
  console.log(`[${new Date().toTimeString().slice(0,8)}] ${req.method} ${req.path}`);
  next();
});

/* ── Routes ── */
app.use('/api/auth',   authRoutes);
app.use('/api/budget', budgetRoutes);

/* ── Health check ── */
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), db: process.env.NEO4J_URI });
});

/* ── 404 ── */
app.use((_req, res) => res.status(404).json({ message: 'Route not found' }));

/* ── Global error handler ── */
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ message: err.message });
});

/* ── Start ── */
async function start() {
  console.log('\n========================================');
  console.log('  FINIA — Smart Budget Tracker');
  console.log('========================================');
  console.log(`  NEO4J_URI  = ${process.env.NEO4J_URI || '(not set)'}`);
  console.log(`  NEO4J_USER = ${process.env.NEO4J_USER || '(not set)'}`);
  console.log(`  PASSWORD   = ${process.env.NEO4J_PASSWORD ? '✅ set' : '❌ NOT SET'}`);
  console.log(`  JWT_SECRET = ${process.env.JWT_SECRET ? '✅ set' : '❌ NOT SET'}`);
  console.log('----------------------------------------');

  let retries = 3;
  while (retries > 0) {
    try {
      await verifyConnection();
      break;
    } catch (e) {
      retries--;
      if (retries === 0) {
        console.error('❌ Neo4j connection failed after 3 attempts:', e.message);
        console.error('\n  HOW TO FIX:');
        console.error('  • For Aura: check NEO4J_URI starts with neo4j+s://');
        console.error('  • For Desktop: make sure the database is RUNNING');
        console.error('  • Double-check NEO4J_PASSWORD in your .env\n');
      } else {
        console.log(`  Retrying Neo4j connection... (${retries} left)`);
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  }

  app.listen(PORT, () => {
    console.log(`\n🚀 Server running → http://localhost:${PORT}`);
    console.log(`   Open the app  → http://localhost:${PORT}/index.html\n`);
  });
}

start();

process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await driver.close();
  process.exit(0);
});