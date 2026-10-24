// Run with node --experimental-vm-modules --test scripts/test-eod-review-replies.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { SourceTextModule, SyntheticModule } from "node:vm";
import { createRequire } from "node:module";

const source = await readFile(new URL("../src/app/api/operations/eod-reports/[id]/replies/route.js", import.meta.url), "utf8");

async function invoke({ role = "operations", loggedIn = true, message = "Work completed", owned = true, hidden = false, note = "Please follow up", insertError = null } = {}) {
  const writes = [];
  const audits = [];
  const filters = {};
  const report = { id: "report-1", review_note: note };
  const db = {
    from(table) {
      if (table === "operation_eod_reports") {
        return {
          select() { return this; },
          eq(key, value) { filters[key] = value; return this; },
          is(key, value) { filters[key] = value; return this; },
          async maybeSingle() { return { data: owned && !hidden ? report : null }; },
        };
      }
      assert.equal(table, "operation_eod_replies");
      return {
        insert(value) {
          writes.push(value);
          return { select() { return { async single() { return { data: { id: "reply-1", ...value }, error: insertError }; } }; } };
        },
      };
    },
  };
  const mocks = {
    "next/server": { NextResponse: { json: (data, options = {}) => ({ data, status: options.status || 200 }) } },
    "@/lib/supabaseServer": { createClient: async () => ({}) },
    "@/lib/auth/permissions": {
      getAuthContext: async () => ({ user: loggedIn ? { id: "operator-1" } : null, profile: {}, role }),
      canSubmitEod: (value) => ["operations", "sales"].includes(value),
    },
    "@/lib/tasks/assignees": { getTaskDataClient: () => db },
    "@/lib/audit/logger": { writeAuditLog: async (_, value) => audits.push(value) },
  };
  const module = new SourceTextModule(source);
  await module.link((specifier) => {
    const exports = mocks[specifier];
    assert.ok(exports, specifier);
    return new SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    });
  });
  await module.evaluate();
  const response = await module.namespace.POST({ json: async () => ({ message, status: "Reviewed", created_by: "someone-else" }) }, { params: Promise.resolve({ id: "report-1" }) });
  return { response, writes, audits, filters };
}

test("requires login and an EOD submitting role", async () => {
  for (const [options, status] of [[{ loggedIn: false }, 401], [{ role: "admin" }, 403], [{ role: "viewer" }, 403]]) {
    const result = await invoke(options);
    assert.equal(result.response.status, status);
    assert.equal(result.writes.length, 0);
  }
});

test("rejects empty, invalid, and oversized replies", async () => {
  for (const message of [" ", null, 123, "x".repeat(2501)]) {
    const result = await invoke({ message });
    assert.equal(result.response.status, 400);
    assert.equal(result.writes.length, 0);
  }
});

test("rejects another user's report and hidden reports", async () => {
  for (const options of [{ owned: false }, { hidden: true }]) {
    const result = await invoke(options);
    assert.equal(result.response.status, 404);
    assert.equal(result.writes.length, 0);
    assert.equal(result.filters.created_by, "operator-1");
    assert.equal(result.filters.operation_hidden_at, null);
  }
});

test("requires an admin review note", async () => {
  const result = await invoke({ note: " " });
  assert.equal(result.response.status, 400);
  assert.equal(result.writes.length, 0);
});

test("stores trimmed reply, review context, authenticated author, and audit", async () => {
  const result = await invoke({ message: "  Follow-up complete  " });
  assert.equal(result.response.status, 201);
  assert.deepEqual(result.writes[0], {
    report_id: "report-1", created_by: "operator-1", message: "Follow-up complete", review_note: "Please follow up",
  });
  assert.equal(result.audits[0].action, "operation_eod_review_replied");
});

test("Sales can reply to their own review but not another user's report", async () => {
  const own = await invoke({ role: "sales" });
  assert.equal(own.response.status, 201);
  assert.equal(own.writes[0].created_by, "operator-1");
  assert.equal((await invoke({ role: "sales", owned: false })).response.status, 404);
});

test("returns database errors without recording success", async () => {
  const result = await invoke({ insertError: { message: "Database unavailable" } });
  assert.equal(result.response.status, 500);
  assert.equal(result.audits.length, 0);
});

const require = createRequire(import.meta.url);
const PGlite = process.env.PGLITE_MODULE ? require(process.env.PGLITE_MODULE).PGlite : null;
test("Sales reply RLS allows only own visible reports and preserves Operations access", { skip: !PGlite }, async () => {
  const db = new PGlite();
  const sales = "00000000-0000-4000-8000-000000000001", ops = "00000000-0000-4000-8000-000000000002";
  const own = "aaaaaaaa-1111-4111-8111-111111111111", other = "bbbbbbbb-1111-4111-8111-111111111111", hidden = "cccccccc-1111-4111-8111-111111111111";
  try {
    await db.exec(`CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE TABLE profiles(id uuid PRIMARY KEY,role text);
      CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
      CREATE TABLE operation_eod_reports(id uuid PRIMARY KEY,created_by uuid,review_note text,operation_hidden_at timestamptz);
      INSERT INTO auth.users VALUES ('${sales}'),('${ops}');
      INSERT INTO profiles VALUES ('${sales}','sales'),('${ops}','operations');
      INSERT INTO operation_eod_reports VALUES ('${own}','${sales}','Review',NULL),('${other}','${ops}','Review',NULL),('${hidden}','${sales}','Review',now());
      GRANT USAGE ON SCHEMA auth TO authenticated;
      GRANT SELECT ON profiles,operation_eod_reports TO authenticated;`);
    await db.exec(await readFile(new URL("../supabase/migrations/202610240001_eod_review_replies.sql", import.meta.url), "utf8"));
    const before = (await db.query("SELECT * FROM operation_eod_reports ORDER BY id")).rows;
    const migration = await readFile(new URL("../supabase/migrations/202610240005_sales_eod_parity.sql", import.meta.url), "utf8");
    await db.exec(migration); await db.exec(migration);
    assert.deepEqual((await db.query("SELECT * FROM operation_eod_reports ORDER BY id")).rows, before);
    await db.exec(`GRANT INSERT,SELECT ON operation_eod_replies TO authenticated; SET request.jwt.claim.sub='${sales}'; SET ROLE authenticated;`);
    const reply = (report, author = sales, note = "Review") => db.query("INSERT INTO operation_eod_replies(report_id,created_by,message,review_note) VALUES ($1,$2,'Reply',$3)", [report,author,note]);
    await reply(own);
    for (const args of [[other], [hidden], [own, ops], [own, sales, "Wrong review"]]) await assert.rejects(reply(...args), /row-level security/);
    await db.exec(`RESET ROLE; SET request.jwt.claim.sub='${ops}'; SET ROLE authenticated;`);
    await reply(other, ops);
    await db.exec("RESET ROLE");
    assert.equal((await db.query("SELECT count(*)::int n FROM operation_eod_replies")).rows[0].n, 2);
  } finally { await db.close(); }
});
