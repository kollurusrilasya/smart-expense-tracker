/* Run this to find which credentials work:
   node test-connection.js
*/
require('dotenv').config();
const neo4j = require('neo4j-driver');

const URI      = 'neo4j+s://8d5bce96.databases.neo4j.io';
const PASSWORD = 'mgDREZowUpbCOdAlVOX7WcqQ3qHgLF1JLzkTzOGWYyc';

async function tryConnect(user) {
  const d = neo4j.driver(URI, neo4j.auth.basic(user, PASSWORD), { disableLosslessIntegers: true });
  const s = d.session();
  try {
    await s.run('RETURN 1');
    console.log(`✅ SUCCESS with USER = "${user}"`);
    console.log(`\nPut this in your .env:`);
    console.log(`NEO4J_URI=${URI}`);
    console.log(`NEO4J_USER=${user}`);
    console.log(`NEO4J_PASSWORD=${PASSWORD}`);
    console.log(`JWT_SECRET=finia_do_not_change_after_users_register_2024`);
    console.log(`PORT=3001`);
    return true;
  } catch(e) {
    console.log(`❌ FAILED  with USER = "${user}" → ${e.message}`);
    return false;
  } finally {
    await s.close();
    await d.close();
  }
}

async function main() {
  console.log(`\nTesting connection to: ${URI}`);
  console.log(`Password length: ${PASSWORD.length} chars\n`);
  
  const ok1 = await tryConnect('neo4j');
  if (!ok1) await tryConnect('8d5bce96');
  
  console.log('\nDone.');
}

main().catch(console.error);