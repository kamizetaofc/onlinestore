import { supabase, money } from "./supabaseClient.js";

const $ = (selector) => document.querySelector(selector);
const statusPanel = $("#payment-status");
const statusIcon = $("#payment-status-icon");
const statusHeading = $("#payment-heading");
const statusDescription = $("#payment-description");
const details = $("#payment-details");
const refreshButton = $("#refresh-payment");

const paymentLabels = {
  pending: {
    title: "Aguardando o pagamento",
    description: "Assim que a InfinitePay confirmar o pagamento, o status será atualizado aqui.",
    tone: "pending",
    icon: "◷",
  },
  awaiting_payment: {
    title: "Aguardando o pagamento",
    description: "Assim que a InfinitePay confirmar o pagamento, o status será atualizado aqui.",
    tone: "pending",
    icon: "◷",
  },
  unpaid: {
    title: "Não pago",
    description: "Ainda não há confirmação de pagamento para este pedido.",
    tone: "pending",
    icon: "!",
  },
  not_paid: {
    title: "Não pago",
    description: "Ainda não há confirmação de pagamento para este pedido.",
    tone: "pending",
    icon: "!",
  },
  paid: {
    title: "Pagamento recebido!",
    description: "A InfinitePay confirmou o pagamento. Seu pedido foi registrado e seguirá para processamento.",
    tone: "success",
    icon: "✓",
  },
  settled: {
    title: "Pagamento confirmado e liquidado",
    description: "O pagamento foi confirmado e liquidado pela InfinitePay.",
    tone: "success",
    icon: "✓",
  },
  failed: {
    title: "Pagamento não aprovado",
    description: "A InfinitePay não confirmou a aprovação deste pagamento. Confira o status no seu meio de pagamento antes de tentar novamente.",
    tone: "error",
    icon: "!",
  },
  payment_failed: {
    title: "Pagamento não aprovado",
    description: "A InfinitePay não confirmou a aprovação deste pagamento. Confira o status no seu meio de pagamento antes de tentar novamente.",
    tone: "error",
    icon: "!",
  },
  declined: {
    title: "Pagamento não aprovado",
    description: "Confira os dados do pagamento ou escolha outra forma de pagamento.",
    tone: "error",
    icon: "!",
  },
  cancelled: {
    title: "Pagamento cancelado",
    description: "Esta cobrança foi cancelada e não foi registrada como paga.",
    tone: "neutral",
    icon: "×",
  },
  canceled: {
    title: "Pagamento cancelado",
    description: "Esta cobrança foi cancelada e não foi registrada como paga.",
    tone: "neutral",
    icon: "×",
  },
  refunded: {
    title: "Pagamento estornado",
    description: "O estorno deste pagamento foi registrado.",
    tone: "neutral",
    icon: "↺",
  },
  processing: {
    title: "Pagamento em processamento",
    description: "O pagamento ainda está sendo processado. Atualize esta página para consultar novamente.",
    tone: "pending",
    icon: "◷",
  },
};

const orderLabels = {
  awaiting_payment: "Aguardando o pagamento",
  created: "Pedido criado",
  pending: "Aguardando processamento",
  paid_pending_seller: "Pagamento recebido",
  paid: "Pago",
  processing: "Em preparação",
  preparing: "Em preparação",
  shipped: "Enviado",
  in_transit: "Em transporte",
  delivered: "Entregue",
  completed: "Concluído",
  cancelled: "Pedido cancelado",
  canceled: "Pedido cancelado",
  refunded: "Pedido estornado",
};

function humanizeStatus(status) {
  const value = String(status || "").trim().toLowerCase();
  if (!value) return "Não informado";
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/(^|\s)\p{L}/gu, (letter) => letter.toUpperCase());
}

function showStatus({ title, description, tone = "neutral", icon = "i" }) {
  statusPanel.className = "payment-status-panel tone-" + tone;
  statusIcon.textContent = icon;
  statusHeading.textContent = title;
  statusDescription.textContent = description;
}

async function refresh() {
  refreshButton.disabled = true;
  refreshButton.textContent = "Consultando…";
  showStatus({
    title: "Consultando seu pagamento…",
    description: "Estamos verificando as informações mais recentes do pedido.",
    tone: "loading",
    icon: "◷",
  });

  try {
    const nsu = new URLSearchParams(window.location.search).get("order_nsu");
    if (!nsu) {
      details.hidden = true;
      showStatus({
        title: "Código do pedido não informado",
        description: "Volte à loja e consulte o pedido pela sua conta para ver o status correto.",
        tone: "error",
        icon: "!",
      });
      return;
    }

    const { data, error } = await supabase
      .from("orders")
      .select("order_nsu,total_cents,order_status,payment_status")
      .eq("order_nsu", nsu)
      .maybeSingle();

    if (error || !data) {
      details.hidden = true;
      showStatus({
        title: "Não conseguimos localizar seu pedido",
        description: "Confira se você está conectado à conta usada na compra e tente atualizar o status novamente.",
        tone: "neutral",
        icon: "i",
      });
      return;
    }

    const paymentStatus = String(data.payment_status || "").trim().toLowerCase();
    const orderStatus = String(data.order_status || "").trim().toLowerCase();
    const paymentCopy = paymentLabels[paymentStatus] || {
      title: humanizeStatus(paymentStatus),
      description: "Este é o status mais recente registrado para o pagamento. Atualize a tela para consultar novamente.",
      tone: "neutral",
      icon: "i",
    };

    showStatus(paymentCopy);
    $("#payment-order-nsu").textContent = data.order_nsu || "—";
    $("#payment-total").textContent = money(data.total_cents);
    $("#payment-order-status").textContent = orderLabels[orderStatus] || humanizeStatus(orderStatus);
    details.hidden = false;
  } catch (error) {
    console.error("Falha ao consultar status do pedido:", error);
    details.hidden = true;
    showStatus({
      title: "Não foi possível consultar agora",
      description: "Verifique sua conexão e tente atualizar o status novamente.",
      tone: "error",
      icon: "!",
    });
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = "Atualizar status";
  }
}

refreshButton.addEventListener("click", refresh);
refresh();
