import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SourceTextModule, SyntheticModule } from "node:vm";
import { createRequire } from "node:module";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
async function load(file, mocks = {}) {
  const module = new SourceTextModule(await readFile(new URL(file, root), "utf8"));
  await module.link((name) => {
    assert.ok(mocks[name], name);
    return new SyntheticModule(Object.keys(mocks[name]), function () {
      for (const [key, value] of Object.entries(mocks[name])) this.setExport(key, value);
    });
  });
  await module.evaluate();
  return module.namespace;
}
const dates = await load("src/lib/dateInput.js");
const birthdays = await load("src/lib/birthdays.js", { "@/lib/dateInput": dates });
const uuid = "aaaaaaaa-1111-4111-8111-111111111111";

function fixture() {
  let role = "operations", signedIn = true, missingMigration = false;
  const writes = [], audit = [];
  const tables = {
    clients: [{ id: uuid, full_name: "Profile client", date_of_birth: "1990-01-01", operations_owner: "me" }],
    client_holders: [], tasks: [],
    manual_client_birthdays: [{ id: uuid, person_name: "Manual person", date_of_birth: "1995-05-06" }],
    birthday_changes: [],
  };
  const db = { from(table) {
    let filters = [], mutation, range;
    const q = {
      select() { return this; }, order() { return this; },
      eq(key, value) {
        assert.notEqual(table === "clients" ? key : "", "is_active", "clients has no is_active column");
        filters.push((row) => row[key] === value); return this;
      },
      not(key, operator, value) { filters.push((row) => row[key] !== value); return this; },
      range(from, to) { range = [from, to]; return this; },
      upsert(value) { mutation = value; return this; },
      single() { return this.result(true); },
      then(resolve, reject) { return this.result().then(resolve, reject); },
      async result(single = false) {
        if (missingMigration && table === "birthday_changes") return { error: { code: "PGRST205" }, data: null };
        if (mutation) {
          writes.push({ table, payload: mutation });
          const index = tables[table].findIndex((row) => row.event_id === mutation.event_id);
          if (index < 0) tables[table].push(mutation); else tables[table][index] = mutation;
          return { data: mutation, error: null };
        }
        let rows = (tables[table] || []).filter((row) => filters.every((filter) => filter(row)));
        if (range) rows = rows.slice(range[0], range[1] + 1);
        return { data: single ? rows[0] : rows, error: null };
      },
    };
    return q;
  } };
  return {
    tables, writes, audit,
    set role(value) { role = value; },
    set signedIn(value) { signedIn = value; },
    set missingMigration(value) { missingMigration = value; },
    mocks: {
      "next/server": { NextResponse: { json: (data, options = {}) => Response.json(data, options) } },
      "@/lib/supabaseServer": { createClient: async () => db },
      "@/lib/auth/permissions": {
        getAuthContext: async () => ({ user: signedIn ? { id: "me" } : null, role, profile: { role } }),
        isAdmin: (value) => value === "admin", isOperations: (value) => value === "operations",
      },
      "@/lib/audit/logger": { writeAuditLog: async (db, value) => audit.push(value) },
      "@/data/clientBirthdays.json": { default: { entries: [{ id: "imported-1", person_name: "Imported person", date_of_birth: "1980-03-04" }] } },
      "@/lib/birthdays": birthdays,
    },
  };
}
const request = (method, body) => new Request("https://crm.test/api/birthdays?month=7&year=2026", {
  method, ...(body ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } } : {}),
});

test("birthday validation rejects impossible/future dates and trims names", () => {
  assert.deepEqual(birthdays.validateBirthday({ person_name: "  Name ", date_of_birth: "2000-02-29" }, "2026-10-31"), { person_name: "Name", date_of_birth: "2000-02-29" });
  for (const date_of_birth of ["1900-02-29", "2000-02-30", "2027-01-01", "29/02/2000", "", "0000-01-01"]) {
    assert.ok(birthdays.validateBirthday({ person_name: "Name", date_of_birth }, "2026-10-31").error);
  }
  assert.ok(birthdays.validateBirthday({ person_name: " ", date_of_birth: "2000-01-01" }).error);
});

test("Operations and Admin can edit imported/manual/profile birthdays without modifying client data", async () => {
  for (const role of ["operations", "admin"]) {
    const f = fixture(); f.role = role;
    const api = await load("src/app/api/birthdays/route.js", f.mocks);
    const original = structuredClone(f.tables.clients);
    for (const id of ["imported-1", `manual-${uuid}`, `client-${uuid}`]) {
      const result = await api.PATCH(request("PATCH", { id, person_name: "Corrected name", date_of_birth: "1985-07-08" }));
      assert.equal(result.status, 200);
      const calendar = await (await api.GET(request("GET"))).json();
      assert.equal(calendar.events.find((row) => row.id === id).date_of_birth, "1985-07-08");
      assert.ok(calendar.calendar.some((row) => row.id === id));
    }
    assert.deepEqual(f.tables.clients, original);
    assert.equal(f.audit.length, 3);
    assert.ok(f.writes.every((write) => write.table === "birthday_changes"));
  }
});

test("deleting a birthday removes it from every calendar response and preserves source records", async () => {
  for (const role of ["operations", "admin"]) {
    const f = fixture(); f.role = role;
    const api = await load("src/app/api/birthdays/route.js", f.mocks);
    assert.equal((await api.DELETE(request("DELETE", { id: `manual-${uuid}` }))).status, 200);
    const calendar = await (await api.GET(request("GET"))).json();
    for (const key of ["events", "calendar", "today", "upcoming"]) assert.ok(calendar[key].every((row) => row.id !== `manual-${uuid}`));
    assert.equal(f.tables.manual_client_birthdays.length, 1);
    assert.equal((await api.PATCH(request("PATCH", { id: `manual-${uuid}`, person_name: "Restore", date_of_birth: "2000-01-01" }))).status, 404);
  }
});

test("Sales/unauthenticated users, inaccessible IDs and invalid edits cannot mutate birthdays", async () => {
  const f = fixture(), api = await load("src/app/api/birthdays/route.js", f.mocks);
  const body = { id: "imported-1", person_name: "Name", date_of_birth: "2000-01-01" };
  f.role = "sales";
  for (const method of ["GET", "PATCH", "DELETE", "POST"]) assert.equal((await api[method](request(method, method === "GET" ? null : body))).status, 403);
  f.signedIn = false;
  assert.equal((await api.DELETE(request("DELETE", body))).status, 401);
  f.signedIn = true; f.role = "operations";
  assert.equal((await api.PATCH(request("PATCH", { ...body, date_of_birth: "2000-02-30" }))).status, 400);
  assert.equal((await api.DELETE(request("DELETE", { id: "client-inaccessible" }))).status, 404);
  assert.equal((await api.PATCH(new Request("https://crm.test/api/birthdays", { method: "PATCH", body: "invalid json" }))).status, 400);
  assert.equal(f.writes.length, 0);
});

test("missing migration keeps existing calendar readable and returns actionable mutation error", async () => {
  const f = fixture(); f.missingMigration = true;
  const api = await load("src/app/api/birthdays/route.js", f.mocks);
  const calendar = await (await api.GET(request("GET"))).json();
  assert.equal(calendar.can_manage, false); assert.equal(calendar.events.length, 3);
  const result = await api.DELETE(request("DELETE", { id: "imported-1" }));
  assert.equal(result.status, 409); assert.match((await result.json()).error, /202610310001/);
});

test("birthday change reads paginate beyond 1,000 edits", async () => {
  const f = fixture();
  f.tables.birthday_changes = Array.from({ length: 1001 }, (_, index) => ({ event_id: `unused-${index}` }));
  f.tables.birthday_changes.push({ event_id: "imported-1", deleted: true });
  const api = await load("src/app/api/birthdays/route.js", f.mocks);
  assert.ok((await (await api.GET(request("GET"))).json()).events.every((row) => row.id !== "imported-1"));
});

test("additive birthday migration is repeatable and enforces role-based access in PostgreSQL", async () => {
  const require = createRequire(import.meta.url);
  const { PGlite } = require(process.env.PGLITE_MODULE || "@electric-sql/pglite");
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      INSERT INTO auth.users VALUES ('${uuid}');
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT current_setting('test.uid',true)::uuid $$;
      CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('test.role',true) = 'admin' $$;
      CREATE FUNCTION public.is_operations() RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('test.role',true) = 'operations' $$;
      GRANT USAGE ON SCHEMA auth TO authenticated;
      CREATE TABLE clients(id uuid PRIMARY KEY, full_name text);
      INSERT INTO clients VALUES ('${uuid}', 'Preserved client');
    `);
    const sql = await readFile(new URL("supabase/migrations/202610310001_birthday_management.sql", root), "utf8");
    await db.exec(sql); await db.exec(sql);
    assert.equal((await db.query("SELECT full_name FROM clients")).rows[0].full_name, "Preserved client");
    await db.exec(`SET ROLE authenticated; SET test.uid = '${uuid}'; SET test.role = 'operations';`);
    await db.exec(`INSERT INTO birthday_changes(event_id,person_name,date_of_birth,updated_by) VALUES ('imported-1','Name','1990-01-01','${uuid}')`);
    await db.exec(`SET test.role = 'admin'; UPDATE birthday_changes SET deleted=true WHERE event_id='imported-1'`);
    assert.equal((await db.query("SELECT deleted FROM birthday_changes")).rows[0].deleted, true);
    await db.exec("SET test.role = 'sales'");
    assert.equal((await db.query("SELECT * FROM birthday_changes")).rows.length, 0);
    await assert.rejects(db.exec(`INSERT INTO birthday_changes(event_id,updated_by) VALUES ('blocked','${uuid}')`), /row-level security/);
    await db.exec("SET test.role = 'operations'");
    await assert.rejects(db.exec("UPDATE birthday_changes SET updated_by = null"), /row-level security/);
  } finally { await db.close(); }
});
