import type { Pool } from "pg";

/** A PostgreSQL-backed PostgREST query boundary, only for isolated tests.
 * Real SELECTs validate column names, filters, pagination, and SQL types. */
export function fixtureAdmin(pool: Pool) {
  const identifier = (value: string) => {
    if (!/^[a-z_][a-z_0-9]*$/.test(value)) throw new Error("Invalid fixture identifier");
    return `"${value}"`;
  };
  const from = (table: string) => {
    let columns = "*";
    const params: unknown[] = [];
    const conditions: string[] = [];
    const orders: string[] = [];
    let range = "";
    let single = false;
    const bind = (value: unknown) => { params.push(value); return `$${params.length}`; };
    const query = {
      select(value: string) { columns = value === "*" ? "*" : value.split(",").map(value => identifier(value.trim())).join(","); return query; },
      eq(column: string, value: unknown) { conditions.push(`${identifier(column)} = ${bind(value)}`); return query; },
      is(column: string, value: unknown) { if (value !== null) throw new Error("Only null supported"); conditions.push(`${identifier(column)} IS NULL`); return query; },
      not(column: string, op: string, value: unknown) { if (op !== "is" || value !== null) throw new Error("Unsupported not"); conditions.push(`${identifier(column)} IS NOT NULL`); return query; },
      in(column: string, values: unknown[]) { conditions.push(`${identifier(column)} = ANY(${bind(values)})`); return query; },
      lt(column: string, value: unknown) { conditions.push(`${identifier(column)} < ${bind(value)}`); return query; },
      or(value: string) {
        conditions.push(`(${value.split(",").map(term => {
          const [column, op, ...rest] = term.split(".");
          const value = rest.join(".");
          if (op === "is" && value === "null") return `${identifier(column)} IS NULL`;
          if (op !== "eq") throw new Error("Unsupported fixture or");
          return `${identifier(column)} = ${bind(value === "true" ? true : value === "false" ? false : value)}`;
        }).join(" OR ")})`); return query;
      },
      order(column: string, options?: { ascending?: boolean }) { orders.push(`${identifier(column)} ${options?.ascending === false ? "DESC" : "ASC"}`); return query; },
      range(start: number, end: number) { range = ` LIMIT ${end - start + 1} OFFSET ${start}`; return query; },
      maybeSingle() { single = true; return query; },
      async then(resolve: (value: any) => any, reject?: (error: unknown) => any) {
        try {
          const result = await pool.query(`SELECT ${columns} FROM ${identifier(table)}${conditions.length ? ` WHERE ${conditions.join(" AND ")}` : ""}${orders.length ? ` ORDER BY ${orders.join(",")}` : ""}${range}`, params);
          return resolve({ data: single ? result.rows[0] ?? null : result.rows, error: null });
        } catch (error) { return reject ? reject(error) : Promise.reject(error); }
      },
    };
    return query;
  };
  return {
    from,
    async rpc(name: string, args: { p_prediction: unknown; p_league_id: string; p_season_id: string | null }) {
      if (name !== "win_chance_save_prediction") throw new Error("Unexpected RPC");
      const result = await pool.query("SELECT public.win_chance_save_prediction($1::jsonb,$2,$3) AS saved",
        [JSON.stringify(args.p_prediction), args.p_league_id, args.p_season_id]);
      return { data: result.rows[0].saved, error: null };
    },
  };
}
