import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const out = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();

Deno.serve(async (req) => {
  if (req.method !== "POST") return out({ error: "method_not_allowed" }, 405);

  let eventRowId: string | null = null;

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const apiKey = Deno.env.get("INFINITEPAY_API_KEY");
    const handle = Deno.env.get("INFINITEPAY_HANDLE");
    const webhookToken = Deno.env.get("INFINITEPAY_WEBHOOK_TOKEN");

    const missing: string[] = [];
    if (!url) missing.push("SUPABASE_URL");
    if (!serviceKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
    if (!apiKey) missing.push("INFINITEPAY_API_KEY");
    if (!handle) missing.push("INFINITEPAY_HANDLE");
    if (!webhookToken) missing.push("INFINITEPAY_WEBHOOK_TOKEN");
    if (missing.length) return out({ error: "webhook_not_configured", missing }, 503);

    // O checkout atual envia o token na query string da URL do webhook.
    // Nunca registre a URL completa nem o token nos logs da aplicação.
    const requestToken = new URL(req.url).searchParams.get("token");
    if (!requestToken || requestToken !== webhookToken) {
      return out({ error: "unauthorized" }, 401);
    }

    const body = await req.json();
    const nsu = String(body.order_nsu || body.orderNsu || "").trim();
    if (!nsu) return out({ error: "missing_order_nsu" }, 400);

    const db = createClient(url!, serviceKey!);
    const { data: order, error: orderLookupError } = await db
      .from("orders")
      .select("*")
      .eq("order_nsu", nsu)
      .maybeSingle();

    if (orderLookupError) throw orderLookupError;
    if (!order) return out({ error: "order_not_found" }, 404);

    const type = normalize(body.event || body.event_type || body.status || "unknown");
    const transactionNsu = String(body.transaction_nsu || body.transactionNsu || "").trim();

    // A InfinitePay envia invoice_slug no corpo do webhook.
    // A resposta de redirect pode usar o nome slug.
    const slug = String(body.invoice_slug || body.slug || "").trim();

    const eventId = String(
      body.event_id ||
      body.id ||
      [nsu, type, transactionNsu, slug].join(":"),
    );

    const { data: existing, error: existingError } = await db
      .from("payment_events")
      .select("id,processed_at")
      .eq("provider", "infinitepay")
      .eq("event_id", eventId)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing?.processed_at) return out({ ok: true, duplicate: true });

    const { data: event, error: eventError } = await db
      .from("payment_events")
      .upsert({
        provider: "infinitepay",
        event_id: eventId,
        event_type: type,
        order_id: order.id,
        order_nsu: nsu,
        transaction_nsu: transactionNsu || null,
        payload: body,
        processing_error: null,
      }, { onConflict: "provider,event_id" })
      .select("id")
      .single();

    if (eventError) throw eventError;
    eventRowId = event.id;

    let paymentStatus = order.payment_status;
    let orderStatus = order.order_status;
    let receipt = body.receipt_url || null;
    let captureMethod = body.capture_method || null;
    let validated = false;
    let paymentCheck: Record<string, unknown> | null = null;

    if (type === "paid" || type === "settled") {
      if (!transactionNsu || !slug) {
        await db.from("payment_events")
          .update({ processing_error: "Webhook sem transaction_nsu ou invoice_slug/slug." })
          .eq("id", event.id);
        return out({ error: "missing_payment_identifiers" }, 400);
      }

      const checkResponse = await fetch(
        "https://api.checkout.infinitepay.io/payment_check",
        {
          method: "POST",
          headers: {
            "X-Api-Key": apiKey!,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            handle: handle!,
            order_nsu: nsu,
            transaction_nsu: transactionNsu,
            slug,
          }),
        },
      );

      paymentCheck = await checkResponse.json().catch(() => null);
      if (!checkResponse.ok) {
        await db.from("payment_events")
          .update({ processing_error: "A verificação payment_check da InfinitePay falhou." })
          .eq("id", event.id);
        return out({ error: "payment_check_failed" }, 502);
      }

      const status = (paymentCheck || {}) as Record<string, unknown>;
      const paid = status.paid === true || normalize(status.status) === "paid";

      // amount corresponde ao total do pedido. paid_amount pode ser diferente
      // por taxas/parcelamento cobrados no checkout; não deve ser comparado ao total do carrinho.
      const confirmedOrderAmount = Number(status.amount);

      if (
        !paid ||
        !Number.isFinite(confirmedOrderAmount) ||
        Math.round(confirmedOrderAmount) !== Number(order.total_cents)
      ) {
        await db.from("payment_events")
          .update({ processing_error: "Pagamento não confirmado ou valor do pedido divergente." })
          .eq("id", event.id);
        return out({ error: "payment_not_verified_or_amount_mismatch" }, 409);
      }

      paymentStatus = type === "settled" ? "settled" : "paid";
      orderStatus = "paid_pending_seller";
      receipt = status.receipt_url || receipt;
      captureMethod = status.capture_method || captureMethod;
      validated = true;
    } else if (type === "refunded") {
      paymentStatus = "refunded";
      orderStatus = "refunded";
    } else if (type === "canceled" || type === "cancelled") {
      paymentStatus = "cancelled";
      if (
        ["awaiting_payment", "created"].includes(String(order.order_status)) &&
        !["paid", "settled"].includes(normalize(order.payment_status))
      ) {
        orderStatus = "cancelled";
      }
    } else if (type === "payment_failed") {
      paymentStatus = "failed";
    } else if (type === "created") {
      // Um evento atrasado de criação não pode reverter um pagamento já confirmado.
      if (!["paid", "settled", "refunded"].includes(normalize(order.payment_status))) {
        paymentStatus = "pending";
      }
    } else {
      await db.from("payment_events")
        .update({
          processed_at: new Date().toISOString(),
          processing_error: "Evento reconhecido, mas sem alteração de status configurada.",
        })
        .eq("id", event.id);
      return out({ ok: true, ignored: true, reason: "event_not_state_changing" });
    }

    const { error: updateOrderError } = await db
      .from("orders")
      .update({
        payment_status: paymentStatus,
        order_status: orderStatus,
        transaction_nsu: transactionNsu || order.transaction_nsu,
        infinitepay_slug: slug || order.infinitepay_slug,
        receipt_url: receipt || order.receipt_url,
        capture_method: captureMethod || order.capture_method,
        payment_payload: {
          webhook: body,
          payment_check: paymentCheck,
          verified: validated,
        },
      })
      .eq("id", order.id);

    if (updateOrderError) throw updateOrderError;

    const { error: markProcessedError } = await db
      .from("payment_events")
      .update({
        processed_at: new Date().toISOString(),
        processing_error: null,
      })
      .eq("id", event.id);

    if (markProcessedError) throw markProcessedError;

    return out({ ok: true, verified_payment: validated });
  } catch (error) {
    if (eventRowId) {
      try {
        const url = Deno.env.get("SUPABASE_URL");
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (url && serviceKey) {
          const db = createClient(url!, serviceKey!);
          await db.from("payment_events")
            .update({ processing_error: "Falha interna ao processar o webhook." })
            .eq("id", eventRowId);
        }
      } catch {
        // Preserve a resposta de erro original.
      }
    }

    console.error(
      "infinitepay_webhook_error",
      error instanceof Error ? error.message : "unknown_error",
    );
    return out({ error: "internal_error" }, 500);
  }
});
