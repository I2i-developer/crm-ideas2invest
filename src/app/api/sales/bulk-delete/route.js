import { salesContext, salesJson, salesError } from "@/lib/sales/server";
import { sourceId, UUID_RE } from "@/lib/sales/rules";

export const dynamic = "force-dynamic";

async function handle(request, preview) {
  const ctx = await salesContext(request);
  if (ctx.error) return ctx.error;
  if (ctx.role !== "admin") return salesJson({ error: "Only admins can delete imported leads" }, 403);
  try {
    const body = await request.json();
    const source = sourceId(body.source_id);
    if (!source || typeof body.all !== "boolean") throw new Error("Choose a source and deletion scope");
    const ids = body.ids ?? [];
    if (!Array.isArray(ids) || ids.length > 10000 || ids.some((id) => typeof id !== "string" || !UUID_RE.test(id)) || new Set(ids.map((id) => id.toLowerCase())).size !== ids.length) throw new Error("Select distinct valid lead IDs");
    if ((body.all && ids.length) || (!body.all && !ids.length)) throw new Error("Choose selected leads or all imported leads");
    if (!preview && (!/^[a-f0-9]{32}$/.test(body.fingerprint || "") || typeof body.confirmation !== "string")) throw new Error("Review and confirm the deletion first");
    const { data, error } = await ctx.supabase.rpc("sales_delete_imported_leads", {
      p_source: source, p_ids: ids, p_all: body.all, p_preview: preview,
      p_fingerprint: preview ? null : body.fingerprint, p_confirmation: preview ? null : body.confirmation.trim(),
    });
    if (error) throw error;
    return salesJson(data);
  } catch (error) { return salesError(error); }
}

export async function POST(request) { return handle(request, true); }
export async function DELETE(request) { return handle(request, false); }
