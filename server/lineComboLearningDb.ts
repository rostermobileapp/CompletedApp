import { readFile } from "node:fs/promises";
import type { Pool } from "pg";

/** External Supabase database: automatic, additive setup; no owner-pasted SQL. */
export async function ensureLineComboLearningDatabase(pool: Pick<Pool, "connect">) {
  const client = await pool.connect();
  try {
    const source = await readFile(new URL("../migrations/0046_line_combo_learning.sql", import.meta.url), "utf8");
    await client.query(source);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
