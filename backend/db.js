/* ============================================================
   FINIA — backend/db.js
   Compatible with both Neo4j Aura (neo4j+s://) 
   and Neo4j Desktop (bolt://127.0.0.1:7687)
   ============================================================ */
require('dotenv').config();
const neo4j = require('neo4j-driver');

const URI      = process.env.NEO4J_URI      || 'bolt://127.0.0.1:7687';
const USER     = process.env.NEO4J_USER     || 'neo4j';
const PASSWORD = process.env.NEO4J_PASSWORD || process.env.NEO4J_PASS || 'neo4j';

/* Aura uses neo4j+s:// which handles TLS automatically.
   Desktop uses bolt:// — both work with the same driver. */
const driver = neo4j.driver(
  URI,
  neo4j.auth.basic(USER, PASSWORD),
  {
    maxConnectionPoolSize: 10,
    connectionAcquisitionTimeout: 30000, /* Aura needs more time on cold start */
    disableLosslessIntegers: true,
  }
);

async function verifyConnection() {
  const session = driver.session();
  try {
    await session.run('RETURN 1 AS ping');
    console.log(`✅ Neo4j connected → ${URI}`);
  } finally {
    await session.close();
  }
}

async function runQuery(query, params = {}) {
  const session = driver.session();
  try {
    const result = await session.run(query, params);
    return result.records;
  } catch (err) {
    console.error('[Neo4j] Query error:', err.message);
    throw err;
  } finally {
    await session.close();
  }
}

async function runWrite(query, params = {}) {
  const session = driver.session();
  try {
    /* executeWrite is the modern API (driver v5+) */
    const result = await session.executeWrite(tx => tx.run(query, params));
    return result.records;
  } catch (err) {
    console.error('[Neo4j] Write error:', err.message);
    throw err;
  } finally {
    await session.close();
  }
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

module.exports = { driver, verifyConnection, runQuery, runWrite, serializeNode };