type Queryable = {
  query: (text: string, values?: any[]) => Promise<{ rows: any[] }>;
};

/**
 * Only private owner-managed storage is trusted. Never accept an override from
 * profile metadata, navigation preferences, a request body, or a role mirror.
 * Older development databases may not have this optional installation.
 */
export async function readManualProOverride(db: Queryable, userId: string): Promise<boolean> {
  const { rows } = await db.query(
    "SELECT to_regclass('pro_access.manual_overrides') IS NOT NULL AS installed",
  );
  if (!rows[0]?.installed) return false;
  const result = await db.query(
    "SELECT enabled FROM pro_access.manual_overrides WHERE user_id=$1",
    [userId],
  );
  return result.rows[0]?.enabled === true;
}
