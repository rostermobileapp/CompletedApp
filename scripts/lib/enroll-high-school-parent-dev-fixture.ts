import assert from "node:assert/strict";
import type { ParentSql } from "../../server/highSchoolParentSecurity";

/** No public endpoint. Only synthetic fixtures may use this helper. */
export async function enrollSyntheticParent(pool: ParentSql, id: string, marker: string) {
  const tx = await pool.connect();
  try {
    await tx.query("BEGIN");
    const rows = await tx.query(`SELECT email,email_confirmed_at,email_change,phone,
      raw_app_meta_data FROM auth.users WHERE id=$1 FOR UPDATE`, [id]);
    const user = rows.rows[0];
    assert.ok(user?.email_confirmed_at);
    assert.equal(user.raw_app_meta_data?.synthetic_high_school_parent_dev, marker);
    assert.ok(user.email.endsWith("@example.com"));
    assert.ok(!user.email_change && !user.phone);
    const factors = await tx.query("SELECT 1 FROM auth.mfa_factors WHERE user_id=$1", [id]);
    assert.equal(factors.rows.length, 0);
    const identities = await tx.query("SELECT provider FROM auth.identities WHERE user_id=$1", [id]);
    assert.equal(identities.rows.length, 1);
    assert.equal(identities.rows[0].provider, "email");
    await tx.query("INSERT INTO hs_parent_security.accounts(auth_id,parent_email) VALUES ($1,$2)", [id, user.email]);
    await tx.query("INSERT INTO hs_parent_security.audit(auth_id,event) VALUES ($1,'synthetic_account_enrolled')", [id]);
    await tx.query("COMMIT");
  } catch (error) { await tx.query("ROLLBACK"); throw error; }
  finally { tx.release(); }
}
