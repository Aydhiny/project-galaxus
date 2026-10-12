// Database backup you keep on your own PC. Super admin only. Read-only: it
// never writes, deletes or locks anything — just SELECTs each table and
// streams it out as one JSON file.
//
//   GET /api/admin/backup?scope=all  → every table, every user
//   GET /api/admin/backup?scope=me   → only your rows (tables with a user_id, plus your user row)
import { NextRequest, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { isSuperAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Rows = { rows: Record<string, unknown>[] };
const SAFE = /^[a-z_][a-z0-9_]*$/;

export async function GET(req: NextRequest) {
  const session = await auth();
  const userId = Number(session?.user?.id);
  if (!(await isSuperAdmin(userId))) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  const scope = req.nextUrl.searchParams.get("scope") === "me" ? "me" : "all";

  const tables = ((await db.execute(sql`
    select t.table_name as name, bool_or(c.column_name = 'user_id') as has_user
    from information_schema.tables t join information_schema.columns c on c.table_name = t.table_name and c.table_schema = t.table_schema
    where t.table_schema = 'public' and t.table_type = 'BASE TABLE'
    group by t.table_name order by t.table_name`)) as unknown as Rows).rows
    .map((r) => ({ name: String(r.name), hasUser: !!r.has_user }))
    .filter((t) => SAFE.test(t.name));

  const enc = new TextEncoder();
  const stamp = new Date().toISOString();
  const stream = new ReadableStream({
    async start(controller) {
      const write = (s: string) => controller.enqueue(enc.encode(s));
      write(`{"app":"galaxus","format":1,"createdAt":"${stamp}","scope":"${scope}","tables":{`);
      let first = true;
      for (const t of tables) {
        let query;
        if (scope === "me") {
          if (t.name === "users") query = sql.raw(`select * from "users" where id = ${userId}`);
          else if (t.hasUser) query = sql.raw(`select * from "${t.name}" where user_id = ${userId}`);
          else continue;
        } else query = sql.raw(`select * from "${t.name}"`);
        try {
          const rows = ((await db.execute(query)) as unknown as Rows).rows;
          write(`${first ? "" : ","}${JSON.stringify(t.name)}:${JSON.stringify(rows)}`);
          first = false;
        } catch (e) {
          write(`${first ? "" : ","}${JSON.stringify(t.name)}:{"error":${JSON.stringify((e as Error).message)}}`);
          first = false;
        }
      }
      write("}}");
      controller.close();
    },
  });
  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="galaxus-backup-${scope}-${stamp.slice(0, 19).replace(/[:T]/g, "-")}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
