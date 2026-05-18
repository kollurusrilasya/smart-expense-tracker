/* ============================================================
   FINIA — backend/db.js
   ============================================================ */
require('dotenv').config();
const neo4j = require('neo4j-driver');

const URI      = process.env.NEO4J_URI      || 'bolt://127.0.0.1:7687';
const USER     = process.env.NEO4J_USER     || process.env.NEO4J_USERNAME || 'neo4j';
const PASSWORD = process.env.NEO4J_PASSWORD || '';

console.log(`[db.js] Connecting with URI=${URI} USER=${USER} PASSWORD_LENGTH=${PASSWORD.length}`);

const driver = neo4j.driver(
  URI,
  neo4j.auth.basic(USER, PASSWORD),
  {
    maxConnectionPoolSize: 5,
    connectionAcquisitionTimeout: 60000,
    connectionTimeout: 30000,
    maxTransactionRetryTime: 30000,
    disableLosslessIntegers: true,
    /* Required for Aura on Render — prevents stale connection pool after sleep */
    encrypted: true,
    trust: 'TRUST_SYSTEM_CA_SIGNED_CERTIFICATES',
  }
);

async function verifyConnection() {
  const session = driver.session();
  try {
    await session.run('RETURN 1 AS ping');
    console.log(`✅ Neo4j connected → ${URI} (user: ${USER})`);
  } finally {
    await session.close();
  }
}

async function runQuery(query, params = {}) {
  /* Retry once on connection errors (happens when Render wakes from sleep) */
  for (let attempt = 1; attempt <= 2; attempt++) {
    const session = driver.session();
    try {
      const result = await session.run(query, params);
      return result.records;
    } catch (err) {
      await session.close();
      if (attempt === 2 || !isConnectionError(err)) {
        console.error('[Neo4j] Query error:', err.message);
        throw err;
      }
      console.log('[Neo4j] Connection error, retrying in 2s...');
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }
    await session.close();
  }
}

async function runWrite(query, params = {}) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const session = driver.session();
    try {
      const result = await session.executeWrite(tx => tx.run(query, params));
      await session.close();
      return result.records;
    } catch (err) {
      await session.close();
      if (attempt === 2 || !isConnectionError(err)) {
        console.error('[Neo4j] Write error:', err.message);
        throw err;
      }
      console.log('[Neo4j] Connection error, retrying in 2s...');
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

function isConnectionError(err) {
  const msg = err.message || '';
  return msg.includes('routing') ||
         msg.includes('No routing servers') ||
         msg.includes('ServiceUnavailable') ||
         msg.includes('ECONNREFUSED') ||
         msg.includes('connection') ||
         err.code === 'ServiceUnavailable' ||
         err.code === 'SessionExpired';
}

function serializeNode(node) {
  if (!node) return null;
  const props = {};
  Object.entries(node.properties).forEach(([k, v]) => {
    props[k] = (v && typeof v === 'object' && typeof v.toNumber === 'function')
      ? v.toNumber() : v;
  });
  return props;
}

module.exports = { driver, verifyConnection, runQuery, runWrite, serializeNode, URI, USER };