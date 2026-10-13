import { after } from 'node:test';
import { Pool } from 'pg';
import { pool } from '../db';
import { getDatabaseConnectionString } from '../testDatabaseGuard';

const connectionString = getDatabaseConnectionString(process.env, process.argv);
const endpoint = new URL(connectionString);
if (endpoint.hostname !== '127.0.0.1' || endpoint.port !== '55448' ||
    endpoint.pathname !== '/roster_merge_commissioner_test' || endpoint.username !== 'runner') {
  throw new Error('Commissioner merge tests require the isolated local fixture on 127.0.0.1:55448/roster_merge_commissioner_test.');
}
// Production keeps its WebSocket transport. Only this guarded fixture uses TCP.
const tcp = new Pool({ connectionString, max: 5 });
Object.assign(pool, {
  query: tcp.query.bind(tcp), connect: tcp.connect.bind(tcp),
});
after(async () => { await tcp.end(); await pool.end(); });
