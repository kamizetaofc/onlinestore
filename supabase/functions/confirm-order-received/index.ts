import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const out = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return out({ error: "method_not_allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) {
      return out({ error: "server_not_configured" }, 503);
    }

    const authorization = req.headers.get("Authorization") || "";
    const authClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) return out({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    if (typeof body.order_id !== "string" || !body.order_id) {
      return out({ error: "order_id_required" }, 400);
    }

    const db = createClient(url, serviceKey);
    const { data: order, error: lookupError } = await db
      .from("orders")
      .select("id,user_id,order_status,payment_status")
      .eq("id", body.order_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (lookupError) throw lookupError;
    if (!order) return out({ error: "order_not_found" }, 404);

    if (!["paid", "settled"].includes(String(order.payment_status || "").toLowerCase())) {
      return out({
        error: "payment_not_confirmed",
        message: "O pedido só pode ser confirmado depois que o pagamento for aprovado.",
      }, 409);
    }

    if (order.order_status !== "shipped") {
      return out({
        error: "order_not_shipped",
        message: "Só é possível confirmar o recebimento depois que o vendedor marcar o pedido como enviado.",
      }, 409);
    }

    const { data: updated, error: updateError } = await db
      .from("orders")
      .update({ order_status: "completed" })
      .eq("id", order.id)
      .eq("user_id", user.id)
      .eq("order_status", "shipped")
      .select("id,order_status")
      .maybeSingle();

    if (updateError) throw updateError;
    if (!updated) {
      return out({
        error: "order_status_changed",
        message: "O status mudou. Atualize seus pedidos e tente novamente.",
      }, 409);
    }

    return out({ ok: true, order_status: "completed" });
  } catch (error) {
    console.error(
      "confirm_order_received_error",
      error instanceof Error ? error.message : "unknown_error",
    );
    return out({ error: "internal_error" }, 500);
  }
});
