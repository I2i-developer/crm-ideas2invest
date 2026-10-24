// Run with node --experimental-vm-modules --test scripts/test-eod-review-replies.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { SourceTextModule, SyntheticModule } from "node:vm";

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
      isOperations: (value) => value === "operations",
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

test("requires login and operations role", async () => {
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

test("returns database errors without recording success", async () => {
  const result = await invoke({ insertError: { message: "Database unavailable" } });
  assert.equal(result.response.status, 500);
  assert.equal(result.audits.length, 0);
});
