import { supabase, money } from "./supabaseClient.js";

const $ = (selector) => document.querySelector(selector);
const statusPanel = $("#payment-status");
const statusIcon = $("#payment-status-icon");
const statusHeading = $("#payment-heading");
const statusDescription = $("#payment-description");
const details = $("#payment-details");
const refreshButton = $("#refresh-payment");
const downloadButton = $("#download-invoice");
const invoiceFeedback = $("#invoice-download-feedback");
let currentInvoice = null;
let autoDownloadedPaidInvoice = false;
let automaticChecksRemaining = 12;
let automaticCheckTimer = null;

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
  paid_pending_seller: "Pedido pago, aguardando envio",
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


function invoiceOrderStatus(order) {
  const paymentStatus = String(order.payment_status || "").trim().toLowerCase();
  const fulfillment = String(order.fulfillment_method || "").trim().toLowerCase();
  if (["paid", "settled"].includes(paymentStatus)) {
    return fulfillment === "pickup"
      ? "Pedido pago, aguardando retirada"
      : "Pedido pago, aguardando envio";
  }
  if (paymentStatus === "refunded") return "Pagamento estornado";
  if (["cancelled", "canceled"].includes(paymentStatus)) return "Pagamento cancelado";
  if (["failed", "payment_failed", "declined"].includes(paymentStatus)) return "Pagamento não aprovado";
  if (["pending", "unpaid", "not_paid", "awaiting_payment"].includes(paymentStatus)) {
    return "Aguardando o pagamento";
  }
  return humanizeStatus(order.order_status || paymentStatus);
}

function currencyFromCents(cents) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
    .format(Number(cents || 0) / 100);
}

function invoiceDate(value) {
  if (!value) return "Não informado";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Não informado" : date.toLocaleString("pt-BR");
}

function invoiceAddress(order) {
  const address = order.address_snapshot;
  if (!address || typeof address !== "object") return "";
  return [
    [address.street || address.address_line, address.number].filter(Boolean).join(", "),
    address.complement,
    address.neighborhood,
    [address.city, address.state].filter(Boolean).join(" - "),
    address.postal_code || address.cep,
  ].filter(Boolean).join(" · ");
}

function pdfHex(value) {
  const special = {
    "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86,
    "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8A, "‹": 0x8B, "Œ": 0x8C,
    "Ž": 0x8E, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95,
    "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9A, "›": 0x9B,
    "œ": 0x9C, "ž": 0x9E, "Ÿ": 0x9F,
  };
  return Array.from(String(value ?? "")).map((character) => {
    const code = character.codePointAt(0);
    if ((code >= 32 && code <= 126) || (code >= 160 && code <= 255)) {
      return code.toString(16).padStart(2, "0");
    }
    if (special[character]) return special[character].toString(16).padStart(2, "0");
    return "3f";
  }).join("").toUpperCase();
}

function buildInvoicePdf(order) {
  // PDF A4 autossuficiente, sem biblioteca externa.
  const pages = [];
  let commands = [];
  let pageNo = 0;
  const ink = [0.08, 0.09, 0.08];
  const muted = [0.38, 0.41, 0.39];
  const green = [0.12, 0.36, 0.22];
  const white = [1, 1, 1];

  const text = (value, x, y, size = 10, bold = false, color = ink) => {
    commands.push(color.map(n => n.toFixed(3)).join(" ") + " rg BT /" +
      (bold ? "F2" : "F1") + " " + size + " Tf " + x + " " + y +
      " Td <" + pdfHex(value) + "> Tj ET");
  };
  const rect = (x, y, width, height, color) => {
    commands.push(color.map(n => n.toFixed(3)).join(" ") + " rg " +
      x + " " + y + " " + width + " " + height + " re f");
  };
  const line = (x1, y1, x2, y2, color = [0.86, 0.87, 0.86]) => {
    commands.push(color.map(n => n.toFixed(3)).join(" ") +
      " RG 0.6 w " + x1 + " " + y1 + " m " + x2 + " " + y2 + " l S");
  };
  const newPage = (subtitle) => {
    if (commands.length) pages.push(commands);
    commands = [];
    pageNo += 1;
    rect(0, 766, 595, 76, [0.045, 0.055, 0.05]);
    text("KAMIZETA", 42, 808, 20, true, white);
    text(String(subtitle).toUpperCase(), 42, 785, 9, false, [0.83, 0.87, 0.84]);
    text("RESUMO DO PEDIDO - DOCUMENTO INFORMATIVO", 42, 748, 8, false, muted);
    return 716;
  };
  const sectionTitle = (title, y) => {
    text(title, 42, y, 12, true, ink);
    line(42, y - 8, 553, y - 8);
    return y - 28;
  };
  const clip = (value, maxLength) => {
    const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
    return normalized.length > maxLength ? normalized.slice(0, maxLength - 1) + "…" : normalized;
  };
  const orderStatus = invoiceOrderStatus(order);
  const paid = ["paid", "settled"].includes(String(order.payment_status || "").toLowerCase());
  const statusColor = paid ? [0.88, 0.95, 0.89] : [0.98, 0.94, 0.82];

  let y = newPage("Invoice do pedido");
  rect(42, y - 45, 511, 42, statusColor);
  text("STATUS DO PEDIDO", 54, y - 18, 8, true, paid ? green : muted);
  text(clip(orderStatus, 62), 54, y - 35, 12, true, ink);
  y -= 68;

  y = sectionTitle("Dados do pedido", y);
  text("Código:", 42, y, 9, false, muted);
  text(clip(order.order_nsu || "Não informado", 48), 104, y, 9, true);
  text("Data:", 346, y, 9, false, muted);
  text(clip(invoiceDate(order.created_at), 28), 382, y, 8, true);
  y -= 22;
  text("Entrega:", 42, y, 9, false, muted);
  text(String(order.fulfillment_method || "").toLowerCase() === "pickup" ? "Retirada" : "Entrega", 104, y, 9, true);
  y -= 30;

  y = sectionTitle("Cliente", y);
  text("Nome:", 42, y, 9, false, muted);
  text(clip(order.buyer_name || "Não informado", 55), 104, y, 9, true);
  y -= 20;
  text("E-mail:", 42, y, 9, false, muted);
  text(clip(order.email || "Não informado", 60), 104, y, 9, false);
  y -= 20;
  if (order.phone) {
    text("Telefone:", 42, y, 9, false, muted);
    text(clip(order.phone, 50), 104, y, 9, false);
    y -= 20;
  }
  const address = invoiceAddress(order);
  if (address) {
    text("Endereço:", 42, y, 9, false, muted);
    text(clip(address, 76), 104, y, 8, false);
    y -= 25;
  } else {
    y -= 8;
  }

  const drawTableHeader = (top) => {
    rect(42, top - 18, 511, 22, [0.93, 0.94, 0.93]);
    text("PRODUTO", 48, top - 10, 8, true, muted);
    text("QTD.", 374, top - 10, 8, true, muted);
    text("UNITÁRIO", 416, top - 10, 8, true, muted);
    text("TOTAL", 500, top - 10, 8, true, muted);
    return top - 31;
  };

  if (y < 285) y = newPage("Dados do pedido - continuação");
  y = sectionTitle("Itens do pedido", y);
  y = drawTableHeader(y);

  const items = Array.isArray(order.order_items) ? order.order_items : [];
  if (!items.length) {
    text("Os itens não estão disponíveis nesta consulta.", 48, y, 9, false, muted);
    y -= 30;
  } else {
    for (const item of items) {
      if (y < 90) {
        y = newPage("Itens do pedido - continuação");
        y = drawTableHeader(y);
      }
      const productName = clip(item.product_name || item.product_code || "Produto", 43);
      const variant = [item.size, item.product_code].filter(Boolean).join(" - ");
      text(productName, 48, y, 9, true);
      if (variant) text(clip(variant, 42), 48, y - 12, 7, false, muted);
      text(String(item.quantity || 0), 382, y - 2, 9, false);
      text(clip(currencyFromCents(item.unit_price_cents), 14), 416, y - 2, 8, false);
      text(clip(currencyFromCents(Number(item.unit_price_cents || 0) * Number(item.quantity || 0)), 14), 493, y - 2, 8, true);
      line(42, y - 20, 553, y - 20, [0.91, 0.92, 0.91]);
      y -= 32;
    }
  }

  if (y < 160) y = newPage("Resumo financeiro");
  y -= 7;
  line(340, y, 553, y);
  y -= 20;
  text("Subtotal", 374, y, 9, false, muted);
  text(clip(currencyFromCents(order.subtotal_cents), 16), 487, y, 9, false);
  y -= 19;
  text("Frete", 374, y, 9, false, muted);
  text(clip(currencyFromCents(order.shipping_cents), 16), 487, y, 9, false);
  y -= 23;
  rect(342, y - 8, 211, 28, [0.09, 0.11, 0.10]);
  text("TOTAL", 354, y + 2, 10, true, white);
  text(clip(currencyFromCents(order.total_cents), 16), 463, y + 2, 11, true, white);

  y -= 55;
  if (y < 70) y = newPage("Informações");
  text("Documento informativo do pedido. Não substitui nota fiscal nem comprovante emitido pela instituição financeira.", 42, Math.max(48, y), 7, false, muted);
  pages.push(commands);

  const pdfObjects = [];
  const addObject = (contents) => {
    pdfObjects.push(contents);
    return pdfObjects.length;
  };
  const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
  const pagesId = addObject("PAGES_PLACEHOLDER");
  const pageIds = [];
  const fontRegularId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const fontBoldId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");

  for (const pageCommands of pages) {
    const stream = pageCommands.join("\n");
    const contentId = addObject("<< /Length " + stream.length + " >>\nstream\n" + stream + "\nendstream");
    const pageId = addObject("<< /Type /Page /Parent " + pagesId + " 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 " +
      fontRegularId + " 0 R /F2 " + fontBoldId + " 0 R >> >> /Contents " + contentId + " 0 R >>");
    pageIds.push(pageId);
  }
  pdfObjects[pagesId - 1] = "<< /Type /Pages /Kids [" + pageIds.map(id => id + " 0 R").join(" ") + "] /Count " + pageIds.length + " >>";

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < pdfObjects.length; index += 1) {
    offsets.push(pdf.length);
    pdf += (index + 1) + " 0 obj\n" + pdfObjects[index] + "\nendobj\n";
  }
  const xrefOffset = pdf.length;
  pdf += "xref\n0 " + (pdfObjects.length + 1) + "\n0000000000 65535 f \n";
  for (let index = 1; index <= pdfObjects.length; index += 1) {
    pdf += String(offsets[index]).padStart(10, "0") + " 00000 n \n";
  }
  pdf += "trailer\n<< /Size " + (pdfObjects.length + 1) + " /Root " + catalogId + " 0 R >>\nstartxref\n" + xrefOffset + "\n%%EOF";
  return new Blob([pdf], { type: "application/pdf" });
}

function downloadInvoice(order = currentInvoice) {
  if (!order) {
    invoiceFeedback.hidden = false;
    invoiceFeedback.textContent = "Consulte o pedido antes de baixar a invoice.";
    return;
  }
  try {
    const pdf = buildInvoicePdf(order);
    const blobUrl = URL.createObjectURL(pdf);
    const anchor = document.createElement("a");
    const safeCode = String(order.order_nsu || "pedido").replace(/[^a-z0-9_-]/gi, "-");
    anchor.href = blobUrl;
    anchor.download = "kamizeta-invoice-" + safeCode + ".pdf";
    anchor.style.display = "none";
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
    invoiceFeedback.hidden = false;
    invoiceFeedback.textContent = "Download da invoice iniciado. O documento reflete o status confirmado no momento da consulta.";
  } catch (error) {
    console.error("Não foi possível gerar a invoice PDF:", error);
    invoiceFeedback.hidden = false;
    invoiceFeedback.textContent = "Não foi possível gerar o PDF agora. Use Atualizar status e tente novamente.";
  }
}

function scheduleAutomaticStatusCheck() {
  if (automaticCheckTimer || automaticChecksRemaining <= 0) return;
  automaticCheckTimer = window.setTimeout(async () => {
    automaticCheckTimer = null;
    automaticChecksRemaining -= 1;
    await refresh({ quiet: true });
  }, 2500);
}

async function refresh({ quiet = false } = {}) {
  if (!quiet) {
    refreshButton.disabled = true;
    refreshButton.textContent = "Consultando…";
    showStatus({
      title: "Consultando seu pagamento…",
      description: "Estamos verificando as informações mais recentes do pedido.",
      tone: "loading",
      icon: "◷",
    });
  }

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
      .select("id,order_nsu,buyer_name,email,phone,address_snapshot,subtotal_cents,shipping_cents,total_cents,fulfillment_method,order_status,payment_status,created_at,order_items(product_code,product_name,unit_price_cents,quantity,size,item_notes)")
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
    const isConfirmedPaid = ["paid", "settled"].includes(paymentStatus);
    const fulfillment = String(data.fulfillment_method || "").toLowerCase();
    const customerOrderStatus = isConfirmedPaid
      ? (fulfillment === "pickup" ? "Pedido pago, aguardando retirada" : "Pedido pago, aguardando envio")
      : (orderLabels[orderStatus] || humanizeStatus(orderStatus));
    $("#payment-order-status").textContent = customerOrderStatus;
    details.hidden = false;

    currentInvoice = { ...data, order_items: Array.isArray(data.order_items) ? data.order_items : [] };
    downloadButton.hidden = false;
    downloadButton.disabled = false;
    invoiceFeedback.hidden = false;
    invoiceFeedback.textContent = isConfirmedPaid
      ? "O pagamento foi validado. Sua invoice será baixada automaticamente."
      : "Aguardando a confirmação do pagamento para baixar automaticamente a invoice com o status final. Você também pode baixar o status atual pelo botão abaixo.";

    if (isConfirmedPaid && !autoDownloadedPaidInvoice) {
      autoDownloadedPaidInvoice = true;
      window.setTimeout(() => downloadInvoice(currentInvoice), 350);
      if (automaticCheckTimer) {
        window.clearTimeout(automaticCheckTimer);
        automaticCheckTimer = null;
      }
    } else if (!isConfirmedPaid && ["pending", "awaiting_payment", "unpaid", "not_paid", "processing"].includes(paymentStatus)) {
      scheduleAutomaticStatusCheck();
    }
  } catch (error) {
    console.error("Falha ao consultar status do pedido:", error);
    if (!quiet) {
      details.hidden = true;
      showStatus({
        title: "Não foi possível consultar agora",
        description: "Verifique sua conexão e tente atualizar o status novamente.",
        tone: "error",
        icon: "!",
      });
    }
  } finally {
    if (!quiet) {
      refreshButton.disabled = false;
      refreshButton.textContent = "Atualizar status";
    }
  }
}

refreshButton.addEventListener("click", () => refresh());
downloadButton.addEventListener("click", () => downloadInvoice());
refresh();
