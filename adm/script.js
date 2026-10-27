import { supabase } from "../supabaseClient.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

let admin = null;
let selected = [];
let nextToken = null;
let editingId = null;
let adminLoaderCount = 0;
let cachedProducts = [];
let cachedOrders = [];
let cachedStories = [];
let currentPanel = "products";
let currentOrderFilter = "all";

const icons = {
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></svg>',
  filter: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5 5 5M4 20l4.2-.8L19 8.4a2.1 2.1 0 0 0-3-3L5.2 16.2 4 20Z"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
  image: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m21 15-5-5L5 20"/></svg>',
  box: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 4.5v9L12 21l-9-4.5v-9L12 3Z"/><path d="m3.5 7.5 8.5 4.3 8.5-4.3M12 12v9M7.5 5.3l9 4.4"/></svg>',
  truck: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z"/><circle cx="7.5" cy="18" r="1.5"/><circle cx="17.5" cy="18" r="1.5"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  empty: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 5V3m8 2V3M4 10h16"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/></svg>'
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function money(cents) {
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", {
    style: "currency", currency: "BRL"
  });
}

function uniqueid() {
  const id = crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, "")
    : Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
  return "KZ-" + id.toUpperCase();
}

function showAdminLoader(message = "CARREGANDO...") {
  const loader = $("#admin-loader");
  if (!loader) return;
  adminLoaderCount += 1;
  $("[data-loader-message]", loader).textContent = message;
  loader.hidden = false;
}

function hideAdminLoader() {
  const loader = $("#admin-loader");
  adminLoaderCount = Math.max(0, adminLoaderCount - 1);
  if (loader && adminLoaderCount === 0) loader.hidden = true;
}

async function withLoader(callback, message) {
  showAdminLoader(message);
  try {
    return await callback();
  } finally {
    hideAdminLoader();
  }
}

function notify(message, error = false) {
  const status = $("#status");
  status.textContent = message;
  status.classList.toggle("error", error);
}

function closeModal(id) {
  const dialog = $("#" + id);
  if (dialog?.open) dialog.close();
}

function statusLabel(status) {
  const labels = {
    created: "Pedido criado",
    awaiting_payment: "Aguardando pagamento",
    paid_pending_seller: "Pagamento recebido",
    in_progress: "Em preparação",
    preparing: "Em preparação",
    shipped: "Enviado",
    completed: "Recebido",
    cancelled: "Cancelado",
    canceled: "Cancelado",
    refunded: "Estornado"
  };
  return labels[String(status || "").toLowerCase()] || String(status || "Não informado").replace(/[_-]/g, " ");
}

function paymentLabel(status) {
  const labels = {
    pending: "Pendente",
    paid: "Pago",
    settled: "Pago",
    cancelled: "Cancelado",
    refunded: "Estornado",
    failed: "Não aprovado"
  };
  return labels[String(status || "").toLowerCase()] || String(status || "Não informado").replace(/[_-]/g, " ");
}

function paymentTone(status) {
  if (["paid", "settled"].includes(String(status || "").toLowerCase())) return "success";
  if (["pending"].includes(String(status || "").toLowerCase())) return "pending";
  if (["cancelled", "refunded", "failed"].includes(String(status || "").toLowerCase())) return "danger";
  return "neutral";
}

function orderTone(status) {
  if (["shipped", "completed"].includes(String(status || "").toLowerCase())) return "success";
  if (["awaiting_payment", "paid_pending_seller", "in_progress"].includes(String(status || "").toLowerCase())) return "pending";
  if (["cancelled", "refunded"].includes(String(status || "").toLowerCase())) return "danger";
  return "neutral";
}

function addressText(address) {
  if (!address || typeof address !== "object") return "";
  return [
    [address.street || address.address_line, address.number].filter(Boolean).join(", "),
    address.complement,
    address.neighborhood,
    [address.city, address.state].filter(Boolean).join(" - "),
    address.postal_code || address.cep
  ].filter(Boolean).join(" · ");
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("pt-BR");
}

function driveFileIdFromUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl || "").trim());
    const host = url.hostname.toLowerCase();
    if (host !== "drive.google.com" && !host.endsWith(".googleusercontent.com")) return null;
    const pathMatch = url.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/);
    const id = pathMatch?.[1] || url.searchParams.get("id");
    return id && /^[a-zA-Z0-9_-]+$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

function normalizeStoryImageUrl(rawUrl) {
  const id = driveFileIdFromUrl(rawUrl);
  return id ? "https://lh3.googleusercontent.com/d/" + id : null;
}

$("#login-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const fields = new FormData(form);
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: fields.get("email"),
      password: fields.get("password")
    });
    if (error) throw error;
    const { data: isAdmin, error: adminError } = await supabase.rpc("is_store_admin");
    if (adminError || isAdmin !== true) {
      await supabase.auth.signOut();
      throw new Error("Acesso negado: esta conta não tem permissão administrativa.");
    }
    admin = data.user;
    $("#admin-login").hidden = true;
    $("#admin-sidebar").hidden = false;
    $("#admin-app").hidden = false;
    await panel("products");
  } catch (error) {
    notify(error?.message || "Não foi possível entrar.", true);
  } finally {
    button.disabled = false;
  }
});

$("#logout").addEventListener("click", async () => {
  await supabase.auth.signOut();
  location.reload();
});

$$("[data-panel]").forEach(button => {
  button.addEventListener("click", () => panel(button.dataset.panel));
});

async function panel(name) {
  if (!admin) return;
  currentPanel = name;
  $$("[data-panel]").forEach(button => {
    if (button.dataset.panel === name) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  if (name === "products") {
    await renderProductsPanel();
  } else if (name === "stories") {
    await renderStoriesPanel();
  } else {
    await renderOrdersPanel();
  }
}

async function renderProductsPanel() {
  const root = $("#admin-panel");
  selected = [];
  editingId = null;
  root.innerHTML =
    '<header class="panel-heading"><div><p>CATÁLOGO</p><h2>Produtos</h2></div><span id="products-count" class="panel-count"></span></header>' +
    '<div class="toolbar"><label class="search-field">' + icons.search + '<input id="product-search" type="search" placeholder="Pesquisar por nome, código ou categoria" autocomplete="off" aria-label="Pesquisar produtos"></label></div>' +
    '<div id="products-list" class="products-list"><div class="empty-state">' + icons.box + 'Carregando produtos…</div></div>' +
    '<button id="add-product" class="floating-add" type="button" aria-label="Adicionar produto" title="Adicionar produto">+</button>' +
    '<dialog id="product-dialog" class="admin-modal">' +
      '<header class="modal-header"><div><h2 id="product-dialog-title">Novo produto</h2><p>Preencha os dados e selecione as imagens públicas do Drive.</p></div><button type="button" class="icon-button" data-close="product-dialog" aria-label="Fechar">' + icons.close + '</button></header>' +
      '<div class="modal-body">' +
        '<form id="product-form">' +
          '<div class="product-form-grid">' +
            '<label>Nome do produto<input name="name" required maxlength="160"></label>' +
            '<label>Código do produto<input name="product_code" required maxlength="80"></label>' +
            '<label>Preço (R$)<input name="price" type="number" step="0.01" min="0" required></label>' +
            '<label>Categoria<input name="category" required maxlength="100"></label>' +
            '<label>Tamanhos<input name="sizes" placeholder="PP, P, M, G, GG"></label>' +
            '<label>URL do Reels (opcional)<input name="reel_url" type="url" placeholder="https://..."></label>' +
            '<label class="span-2">Descrição<textarea name="description" rows="3"></textarea></label>' +
            '<div class="span-2"><div class="image-picker-toolbar"><button id="toggle-gallery" class="secondary-button" type="button">' + icons.image + ' Selecionar imagens do Drive</button><span id="selected-count" class="panel-count">Nenhuma imagem selecionada</span></div><input name="image_url" type="hidden"><div id="selected-images" class="selected-images"></div>' +
              '<section id="gallery-panel" hidden><p class="gallery-help">Escolha uma ou mais imagens públicas. A primeira selecionada será a capa do produto.</p><div class="image-picker-toolbar"><input id="gallery-search" type="search" placeholder="Pesquisar arquivo do Drive" aria-label="Pesquisar arquivo do Drive"><button id="reload-gallery" class="icon-button" type="button" aria-label="Recarregar galeria" title="Recarregar">' + icons.search + '</button></div><div id="gallery" class="gallery"></div></section></div>' +
            '<label class="checkbox-label span-2"><input type="checkbox" name="is_published"> Publicar produto na loja</label>' +
          '</div>' +
          '<div class="modal-footer"><button type="button" class="secondary-button" data-close="product-dialog">Cancelar</button><button class="primary-button" type="submit">Salvar produto</button></div>' +
        '</form>' +
      '</div>' +
    '</dialog>';

  $("#product-search").addEventListener("input", renderProductCards);
  $("#add-product").addEventListener("click", () => openProductDialog(null));
  $("#toggle-gallery").addEventListener("click", async () => {
    const galleryPanel = $("#gallery-panel");
    galleryPanel.hidden = !galleryPanel.hidden;
    if (!galleryPanel.hidden && !$("#gallery").children.length) {
      await withLoader(() => loadPage(null, true), "Carregando galeria do Drive…");
    }
  });
  $("#reload-gallery").addEventListener("click", () => withLoader(() => loadPage(null, true), "Recarregando galeria…"));
  $("#gallery-search").addEventListener("input", filterGallery);
  $("#product-form").addEventListener("submit", event => withLoader(() => saveProduct(event), "Salvando produto…"));
  $$("[data-close='product-dialog']").forEach(button => button.addEventListener("click", () => closeModal("product-dialog")));

  await withLoader(listProducts, "Carregando produtos…");
}

async function openProductDialog(product) {
  const form = $("#product-form");
  editingId = product?.id || null;
  selected = [];

  if (product) {
    $("#product-dialog-title").textContent = "Editar produto";
    form.elements.name.value = product.name || "";
    form.elements.product_code.value = product.product_code || "";
    form.elements.price.value = (Number(product.price_cents || 0) / 100).toFixed(2);
    form.elements.category.value = product.category || "";
    form.elements.sizes.value = (product.available_sizes || ["PP", "P", "M", "G", "GG"]).join(", ");
    form.elements.reel_url.value = product.reel_url || "";
    form.elements.description.value = product.description || "";
    form.elements.is_published.checked = !!product.is_published;
    selected = (product.product_images || [])
      .slice().sort((a, b) => Number(a.position || 0) - Number(b.position || 0))
      .map(image => ({
        id: image.drive_file_id,
        name: image.alt_text || product.name || "Imagem existente",
        url: image.image_url
      }));
    if (!selected.length && product.image_url) {
      const match = product.image_url.match(/\/d\/([^/?]+)/);
      selected = [{ id: match?.[1] || null, name: "Imagem atual", url: product.image_url }];
    }
  } else {
    $("#product-dialog-title").textContent = "Novo produto";
    form.reset();
    form.elements.product_code.value = uniqueid();
  }

  $("#gallery-panel").hidden = true;
  $("#gallery").innerHTML = "";
  nextToken = null;
  renderSelectedImages();
  $("#product-dialog").showModal();
}

function renderSelectedImages() {
  const container = $("#selected-images");
  const form = $("#product-form");
  if (!container || !form) return;
  form.elements.image_url.value = selected[0]?.url || "";
  $("#selected-count").textContent = selected.length
    ? selected.length + " imagem(ns) selecionada(s)"
    : "Nenhuma imagem selecionada";
  container.innerHTML = selected.map((image, index) =>
    '<div class="selected-image"><img src="' + escapeHtml(image.url) + '" alt=""><span>' + escapeHtml(image.name) + '</span><button type="button" data-remove-selected="' + index + '" aria-label="Remover imagem">×</button></div>'
  ).join("");
  $$("[data-remove-selected]", container).forEach(button => {
    button.addEventListener("click", () => {
      selected.splice(Number(button.dataset.removeSelected), 1);
      renderSelectedImages();
      renderGallerySelection();
    });
  });
}

async function loadPage(pageToken, reset) {
  const gallery = $("#gallery");
  if (reset) {
    gallery.innerHTML = "";
    nextToken = null;
  }
  const wait = document.createElement("p");
  wait.className = "gallery-help";
  wait.textContent = "Carregando imagens…";
  gallery.append(wait);

  const { data, error } = await supabase.functions.invoke("google-drive-gallery", {
    body: { pageToken: pageToken || undefined }
  });
  wait.remove();

  if (error || !data?.files) {
    gallery.insertAdjacentHTML("beforeend",
      '<p class="gallery-help">Não foi possível carregar a galeria. Confira GOOGLE_SERVICE_ACCOUNT_JSON e GOOGLE_DRIVE_FOLDER_ID nos secrets da Edge Function.</p>');
    return;
  }

  for (const file of data.files) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "gallery-card";
    button.dataset.search = String(file.name || "").toLowerCase();
    button.disabled = !file.publicUrl;
    button.innerHTML = '<img src="' + escapeHtml(file.thumbnailUrl || file.publicUrl || "") + '" alt="">' +
      '<span>' + escapeHtml(file.name || "Imagem sem nome") +
      (file.publicUrl ? "" : " · sem acesso público") + "</span>";
    button.dataset.fileId = file.id;
    button.dataset.fileName = file.name || "Imagem do Drive";
    button.dataset.fileUrl = file.publicUrl || "";
    button.addEventListener("click", () => {
      const index = selected.findIndex(item => item.id === file.id);
      if (index >= 0) selected.splice(index, 1);
      else selected.push({ id: file.id, name: file.name || "Imagem do Drive", url: file.publicUrl });
      renderSelectedImages();
      renderGallerySelection();
    });
    gallery.append(button);
  }

  nextToken = data.nextPageToken || null;
  const oldMore = $("#gallery-more");
  oldMore?.remove();
  if (nextToken) {
    const more = document.createElement("button");
    more.id = "gallery-more";
    more.type = "button";
    more.className = "secondary-button";
    more.textContent = "Carregar mais imagens";
    more.addEventListener("click", async () => {
      const token = nextToken;
      more.remove();
      await withLoader(() => loadPage(token, false), "Carregando mais imagens…");
    });
    gallery.after(more);
  }
  filterGallery();
  renderGallerySelection();
}

function filterGallery() {
  const search = ($("#gallery-search")?.value || "").trim().toLowerCase();
  $$(".gallery-card", $("#gallery")).forEach(button => {
    button.hidden = !button.dataset.search.includes(search);
  });
}

function renderGallerySelection() {
  $$(".gallery-card", $("#gallery")).forEach(button => {
    const isSelected = selected.some(item => item.id === button.dataset.fileId);
    button.classList.toggle("selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });
}

async function saveProduct(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!selected.length || !selected[0].url) {
    notify("Selecione pelo menos uma imagem pública do Drive.", true);
    return;
  }
  const fields = new FormData(form);
  const product = {
    name: String(fields.get("name") || "").trim(),
    product_code: String(fields.get("product_code") || "").trim(),
    price_cents: Math.round(Number(fields.get("price")) * 100),
    category: String(fields.get("category") || "").trim(),
    description: String(fields.get("description") || "").trim(),
    image_url: selected[0].url,
    reel_url: String(fields.get("reel_url") || "").trim() || null,
    available_sizes: String(fields.get("sizes") || "PP,P,M,G,GG").split(",").map(size => size.trim()).filter(Boolean),
    is_published: fields.get("is_published") === "on"
  };

  if (!product.name || !product.product_code || !product.category || !Number.isFinite(product.price_cents) || product.price_cents < 0) {
    notify("Confira o nome, código, categoria e preço do produto.", true);
    return;
  }

  let productId = editingId;
  if (editingId) {
    const { error } = await supabase.from("products").update(product).eq("id", editingId);
    if (error) {
      notify("Não foi possível atualizar o produto: " + error.message, true);
      return;
    }
  } else {
    const { data, error } = await supabase.from("products").insert(product).select("id").single();
    if (error) {
      notify("Não foi possível criar o produto: " + error.message, true);
      return;
    }
    productId = data.id;
  }

  const { error: deleteImagesError } = await supabase.from("product_images").delete().eq("product_id", productId);
  if (deleteImagesError) {
    notify("Produto salvo, mas não foi possível atualizar as imagens: " + deleteImagesError.message, true);
    return;
  }
  const images = selected.map((image, index) => ({
    product_id: productId,
    image_url: image.url,
    drive_file_id: image.id || null,
    alt_text: product.name,
    position: index
  }));
  const { error: insertImagesError } = await supabase.from("product_images").insert(images);
  if (insertImagesError) {
    notify("Produto salvo, mas houve erro ao registrar as imagens: " + insertImagesError.message, true);
    return;
  }

  const wasEditing = !!editingId;
  editingId = null;
  selected = [];
  closeModal("product-dialog");
  notify("Produto " + (wasEditing ? "atualizado" : "criado") + " com sucesso.");
  await listProducts();
}

async function deleteProduct(product) {
  const name = String(product.name || "este produto");
  if (!window.confirm('Tem certeza que deseja excluir "' + name + '"? Esta ação não pode ser desfeita.')) return;

  const { error } = await supabase.from("products").delete().eq("id", product.id);
  if (error) {
    notify("Não foi possível excluir o produto. Ele pode estar vinculado a um pedido. " + error.message, true);
    return;
  }

  const { error: imagesError } = await supabase.from("product_images").delete().eq("product_id", product.id);
  if (imagesError) {
    notify("Produto excluído, mas não foi possível limpar os registros das imagens: " + imagesError.message, true);
  } else {
    notify("Produto excluído com sucesso.");
  }
  await listProducts();
}

async function listProducts() {
  const { data, error } = await supabase
    .from("products")
    .select("id,name,price_cents,category,is_published,product_code,description,image_url,reel_url,available_sizes,created_at,product_images(image_url,drive_file_id,alt_text,position)")
    .order("created_at", { ascending: false })
    .limit(150);
  if (error) {
    $("#products-list").innerHTML = '<div class="empty-state">Não foi possível carregar os produtos.</div>';
    notify("Erro ao carregar produtos: " + error.message, true);
    return;
  }
  cachedProducts = data || [];
  renderProductCards();
}

function renderProductCards() {
  const list = $("#products-list");
  if (!list) return;
  const term = ($("#product-search")?.value || "").trim().toLowerCase();
  const filtered = cachedProducts.filter(product =>
    [product.name, product.product_code, product.category, product.description]
      .some(value => String(value || "").toLowerCase().includes(term))
  );
  $("#products-count").textContent = filtered.length + (filtered.length === 1 ? " produto" : " produtos");
  if (!filtered.length) {
    list.innerHTML = '<div class="empty-state">' + icons.box + (term ? "Nenhum produto corresponde à pesquisa." : "Nenhum produto cadastrado.") + "</div>";
    return;
  }
  list.innerHTML = filtered.map(product => {
    const image = (product.product_images || []).slice().sort((a, b) => Number(a.position || 0) - Number(b.position || 0))[0]?.image_url || product.image_url;
    return '<article class="product-card">' +
      (image ? '<img class="product-thumb" src="' + escapeHtml(image) + '" alt="" loading="lazy">' : '<div class="product-thumb product-thumb-placeholder">' + icons.image + "</div>") +
      '<div class="product-details"><h3>' + escapeHtml(product.name) + "</h3>" +
      '<div class="product-meta"><span>' + escapeHtml(product.product_code || "Sem código") + "</span><span>" + escapeHtml(product.category || "Sem categoria") + "</span>" +
      '<span class="status-pill ' + (product.is_published ? "success" : "neutral") + '">' + (product.is_published ? "Publicado" : "Rascunho") + "</span></div>" +
      '<p class="product-price">' + money(product.price_cents) + "</p></div>" +
      '<div class="product-card-actions"><button type="button" class="icon-button" data-edit-product="' + escapeHtml(product.id) + '" aria-label="Editar ' + escapeHtml(product.name) + '" title="Editar produto">' + icons.edit + "</button>" +
      '<button type="button" class="icon-button danger-icon-button" data-delete-product="' + escapeHtml(product.id) + '" aria-label="Excluir ' + escapeHtml(product.name) + '" title="Excluir produto">' + icons.trash + "</button></div>" +
      "</article>";
  }).join("");
  $("[data-edit-product]", list).forEach(button => button.addEventListener("click", () => {
    const product = cachedProducts.find(item => item.id === button.dataset.editProduct);
    openProductDialog(product || null);
  }));
  $("[data-delete-product]", list).forEach(button => button.addEventListener("click", () => {
    const product = cachedProducts.find(item => item.id === button.dataset.deleteProduct);
    if (product) withLoader(() => deleteProduct(product), "Excluindo produto…");
  }));
}

async function renderStoriesPanel() {
  const root = $("#admin-panel");
  root.innerHTML =
    '<header class="panel-heading"><div><p>CONTEÚDO</p><h2>Stories</h2></div></header>' +
    '<form id="story-form" class="stories-form">' +
      '<label>Título<input name="title" maxlength="160" placeholder="Título opcional"></label>' +
      '<label>Tipo de mídia<select name="media_type"><option value="image">Imagem pública do Drive</option><option value="youtube_short">YouTube Shorts</option></select></label>' +
      '<label class="span-2">URL normal da imagem pública do Drive<input name="media_url" type="url" placeholder="https://drive.google.com/file/d/ID/view" required><small class="gallery-help">Para imagens do Drive, cole o link compartilhável normal. O sistema extrairá o ID e converterá para lh3.googleusercontent.com.</small></label>' +
      '<label>Categoria<input name="category" maxlength="100"></label>' +
      '<label>Expira em<input name="expires_at" type="datetime-local"></label>' +
      '<label class="checkbox-label span-2"><input name="is_active" type="checkbox"> Publicar agora</label>' +
      '<div class="span-2"><button class="primary-button" type="submit">Salvar story</button></div>' +
    "</form>" +
    '<div id="stories-list" class="stories-list"><div class="empty-state">Carregando stories…</div></div>';

  $("#story-form").addEventListener("submit", event => withLoader(() => saveStory(event), "Salvando story…"));
  $("#story-form").elements.media_type.addEventListener("change", () => {
    const label = $("#story-form label.span-2");
    label.childNodes[0].textContent = $("#story-form").elements.media_type.value === "image"
      ? "URL normal da imagem pública do Drive"
      : "URL do YouTube Shorts";
    $("#story-form").elements.media_url.placeholder = $("#story-form").elements.media_type.value === "image"
      ? "https://drive.google.com/file/d/ID/view"
      : "https://youtube.com/shorts/ID";
  });
  await withLoader(listStories, "Carregando stories…");
}

async function saveStory(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const fields = new FormData(form);
  const mediaType = String(fields.get("media_type") || "image");
  let mediaUrl = String(fields.get("media_url") || "").trim();

  if (mediaType === "image") {
    const converted = normalizeStoryImageUrl(mediaUrl);
    if (!converted) {
      notify("Cole um link público normal do Google Drive que contenha o ID da imagem.", true);
      return;
    }
    mediaUrl = converted;
  } else {
    try {
      const url = new URL(mediaUrl);
      if (!url.hostname.includes("youtube.com") && !url.hostname.includes("youtu.be")) {
        notify("Informe um link válido do YouTube Shorts.", true);
        return;
      }
    } catch {
      notify("Informe um link válido do YouTube Shorts.", true);
      return;
    }
  }

  const active = fields.get("is_active") === "on";
  const story = {
    title: String(fields.get("title") || "").trim(),
    media_type: mediaType,
    media_url: mediaUrl,
    category: String(fields.get("category") || "").trim() || null,
    expires_at: fields.get("expires_at") ? new Date(fields.get("expires_at")).toISOString() : null,
    is_active: active,
    published_at: active ? new Date().toISOString() : null,
    created_by: admin.id
  };
  const { error } = await supabase.from("stories").insert(story);
  if (error) {
    notify("Não foi possível salvar o story: " + error.message, true);
    return;
  }
  notify(mediaType === "image" ? "Story salvo com a URL da imagem convertida." : "Story salvo com sucesso.");
  form.reset();
  await listStories();
}

async function listStories() {
  const { data, error } = await supabase
    .from("stories")
    .select("id,title,media_type,media_url,is_active,created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    $("#stories-list").innerHTML = '<div class="empty-state">Não foi possível carregar os stories.</div>';
    notify("Erro ao carregar stories: " + error.message, true);
    return;
  }
  cachedStories = data || [];
  $("#stories-list").innerHTML = cachedStories.length ? cachedStories.map(story =>
    '<article class="story-row"><div class="story-row-main">' +
      (story.media_type === "image" ? '<img class="story-thumb" src="' + escapeHtml(story.media_url) + '" alt="">' : '<div class="story-thumb story-thumb-video">' + icons.image + "</div>") +
      '<div><h3>' + escapeHtml(story.title || "Story sem título") + '</h3><p>' + escapeHtml(story.media_type === "image" ? "Imagem pública do Drive" : "YouTube Shorts") + " · " + (story.is_active ? "Ativo" : "Inativo") + "</p></div>" +
      '</div><div class="story-row-actions"><span class="status-pill ' + (story.is_active ? "success" : "neutral") + '">' + (story.is_active ? "Ativo" : "Inativo") + "</span>" +
      '<button type="button" class="icon-button" data-toggle-story="' + escapeHtml(story.id) + '" data-active="' + String(story.is_active) + '" aria-label="' + (story.is_active ? "Desativar story" : "Ativar story") + '" title="' + (story.is_active ? "Desativar" : "Ativar") + '">' +
      (story.is_active ? icons.close : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>') + "</button>" +
      '<button type="button" class="icon-button danger-icon-button" data-delete-story="' + escapeHtml(story.id) + '" aria-label="Excluir story ' + escapeHtml(story.title || "") + '" title="Excluir story">' + icons.trash + "</button></div></article>"
  ).join("") : '<div class="empty-state">' + icons.image + "Nenhum story cadastrado." + "</div>";

  $("[data-toggle-story]").forEach(button => button.addEventListener("click", () => withLoader(async () => {
    const { error: updateError } = await supabase.from("stories")
      .update({ is_active: button.dataset.active !== "true" })
      .eq("id", button.dataset.toggleStory);
    if (updateError) notify("Não foi possível alterar o story: " + updateError.message, true);
    else notify(button.dataset.active === "true" ? "Story desativado." : "Story ativado.");
    await listStories();
  }, "Atualizando story…")));

  $("[data-delete-story]").forEach(button => button.addEventListener("click", () => withLoader(async () => {
    const story = cachedStories.find(item => item.id === button.dataset.deleteStory);
    if (!story) return;
    if (!window.confirm('Tem certeza que deseja excluir o story "' + String(story.title || "sem título") + '"? Esta ação não pode ser desfeita.')) return;
    const { error: deleteError } = await supabase.from("stories").delete().eq("id", story.id);
    if (deleteError) notify("Não foi possível excluir o story: " + deleteError.message, true);
    else notify("Story excluído com sucesso.");
    await listStories();
  }, "Excluindo story…")));
}

async function renderOrdersPanel() {
  const root = $("#admin-panel");
  root.innerHTML =
    '<header class="panel-heading"><div><p>VENDAS</p><h2>Pedidos</h2></div><span id="orders-count" class="panel-count"></span></header>' +
    '<div class="orders-toolbar"><label class="search-field">' + icons.search + '<input id="order-search" type="search" placeholder="Buscar cliente, código ou endereço" aria-label="Pesquisar pedidos" autocomplete="off"></label>' +
    '<button id="open-order-filters" class="icon-button" type="button" aria-label="Filtrar pedidos" title="Filtrar pedidos">' + icons.filter + "</button></div>" +
    '<div id="order-filter-summary" class="filter-summary"></div>' +
    '<div id="orders-list" class="orders-list"><div class="empty-state">' + icons.empty + "Carregando pedidos…</div></div>" +
    '<dialog id="order-filter-dialog" class="admin-modal"><header class="modal-header"><div><h2>Filtrar pedidos</h2><p>Escolha quais pedidos deseja visualizar.</p></div><button type="button" class="icon-button" data-close="order-filter-dialog" aria-label="Fechar">' + icons.close + "</button></header>" +
      '<form id="order-filter-form" class="modal-body"><div class="filter-options">' +
        '<label class="filter-option"><input type="radio" name="order-filter" value="all"><span><b>Todos os pedidos</b><small>Exibe todos os status.</small></span></label>' +
        '<label class="filter-option"><input type="radio" name="order-filter" value="paid"><span><b>Pagos</b><small>Pagamento confirmado pela InfinitePay.</small></span></label>' +
        '<label class="filter-option"><input type="radio" name="order-filter" value="pending"><span><b>Pendentes</b><small>Aguardando confirmação do pagamento.</small></span></label>' +
        '<label class="filter-option"><input type="radio" name="order-filter" value="cancelled"><span><b>Cancelados</b><small>Pedidos cancelados ou estornados.</small></span></label>' +
      '</div><div class="modal-footer"><button type="button" id="clear-order-filters" class="secondary-button">Limpar</button><button type="submit" class="primary-button">Aplicar filtro</button></div></form></dialog>' +
    '<dialog id="order-detail-dialog" class="admin-modal"><header class="modal-header"><div><p>DETALHES DO PEDIDO</p><h2 id="order-detail-title">Pedido</h2></div><button type="button" class="icon-button" data-close="order-detail-dialog" aria-label="Fechar">' + icons.close + "</button></header><div id=\"order-detail-content\" class=\"modal-body\"></div></dialog>";

  $("#order-search").addEventListener("input", renderOrderCards);
  $("#open-order-filters").addEventListener("click", () => {
    const form = $("#order-filter-form");
    const radio = form.querySelector('input[name="order-filter"][value="' + currentOrderFilter + '"]');
    if (radio) radio.checked = true;
    $("#order-filter-dialog").showModal();
  });
  $("#order-filter-form").addEventListener("submit", event => {
    event.preventDefault();
    currentOrderFilter = new FormData(event.currentTarget).get("order-filter") || "all";
    closeModal("order-filter-dialog");
    renderOrderCards();
  });
  $("#clear-order-filters").addEventListener("click", () => {
    currentOrderFilter = "all";
    const all = $('#order-filter-form input[value="all"]');
    if (all) all.checked = true;
    closeModal("order-filter-dialog");
    renderOrderCards();
  });
  $$("[data-close='order-filter-dialog'],[data-close='order-detail-dialog']").forEach(button =>
    button.addEventListener("click", () => closeModal(button.dataset.close))
  );

  await withLoader(listOrders, "Carregando pedidos…");
}

async function listOrders() {
  const { data, error } = await supabase
    .from("orders")
    .select("id,order_nsu,buyer_name,buyer_cpf,email,phone,address_snapshot,total_cents,subtotal_cents,shipping_cents,order_status,payment_status,fulfillment_method,delivery_quote_status,created_at,customer_notes,receipt_url,order_items(id,product_code,product_name,quantity,size,unit_price_cents,item_notes)")
    .order("created_at", { ascending: false })
    .limit(250);

  if (error) {
    $("#orders-list").innerHTML = '<div class="empty-state">Não foi possível carregar os pedidos.</div>';
    notify("Erro ao carregar pedidos: " + error.message, true);
    return;
  }
  cachedOrders = data || [];
  renderOrderCards();
}

function isPaid(order) {
  return ["paid", "settled"].includes(String(order.payment_status || "").toLowerCase());
}

function matchesOrderFilter(order) {
  if (currentOrderFilter === "paid") return isPaid(order);
  if (currentOrderFilter === "pending") return ["pending"].includes(String(order.payment_status || "").toLowerCase()) &&
    !["cancelled", "canceled", "refunded"].includes(String(order.order_status || "").toLowerCase());
  if (currentOrderFilter === "cancelled") return ["cancelled", "canceled", "refunded"].includes(String(order.order_status || "").toLowerCase()) ||
    ["cancelled", "refunded"].includes(String(order.payment_status || "").toLowerCase());
  return true;
}

function renderOrderCards() {
  const list = $("#orders-list");
  if (!list) return;
  const term = ($("#order-search")?.value || "").trim().toLowerCase();
  const filtered = cachedOrders.filter(order => {
    const address = addressText(order.address_snapshot);
    const searchable = [
      order.buyer_name, order.order_nsu, order.email, order.phone, address,
      order.payment_status, order.order_status
    ].some(value => String(value || "").toLowerCase().includes(term));
    return searchable && matchesOrderFilter(order);
  });

  $("#orders-count").textContent = filtered.length + (filtered.length === 1 ? " pedido" : " pedidos");
  const summaryLabels = { all: "Todos", paid: "Pagos", pending: "Pendentes", cancelled: "Cancelados" };
  $("#order-filter-summary").innerHTML = '<span class="filter-chip">' + summaryLabels[currentOrderFilter] + "</span>";
  if (!filtered.length) {
    list.innerHTML = '<div class="empty-state">' + icons.empty + (term ? "Nenhum pedido corresponde à pesquisa." : "Nenhum pedido neste filtro.") + "</div>";
    return;
  }

  list.innerHTML = filtered.map(order => {
    const address = addressText(order.address_snapshot);
    const fulfillment = String(order.fulfillment_method || "").toLowerCase();
    const isDelivery = fulfillment === "delivery";
    const totalLabel = isPaid(order) ? "Total pago" : "Total do pedido";
    const locationLine = isDelivery
      ? (address ? icons.pin + '<span>' + escapeHtml(address) + "</span>" : icons.pin + "<span>Endereço não informado</span>")
      : icons.pin + "<span>Retirada</span>";

    return '<button type="button" class="order-card" data-open-order="' + escapeHtml(order.id) + '">' +
      '<div class="order-card-main"><div class="order-card-top"><h3 class="order-customer">' + escapeHtml(order.buyer_name || "Cliente") + '</h3><span class="order-number">' + escapeHtml(order.order_nsu || "") + "</span></div>" +
      '<span class="status-pill ' + paymentTone(order.payment_status) + '">' + escapeHtml(paymentLabel(order.payment_status)) + "</span>" +
      '<div class="order-subline"><span>' + (isDelivery ? icons.truck + "Entrega" : icons.pin + "Retirada") + "</span><span>" + escapeHtml(statusLabel(order.order_status)) + "</span></div>" +
      '<div class="order-subline">' + locationLine + "</div>" +
      "</div><div class=\"order-card-total\"><strong>" + money(order.total_cents) + "</strong><span>" + totalLabel + "</span><span class=\"status-pill " + orderTone(order.order_status) + "\">" + escapeHtml(statusLabel(order.order_status)) + "</span></div>" +
      '<span class="order-card-arrow">' + icons.chevron + "</span></button>";
  }).join("");

  $$("[data-open-order]", list).forEach(button => {
    button.addEventListener("click", () => {
      const order = cachedOrders.find(item => item.id === button.dataset.openOrder);
      if (order) openOrderDetails(order);
    });
  });
}

function openOrderDetails(order) {
  $("#order-detail-title").textContent = order.order_nsu || "Pedido";
  const address = addressText(order.address_snapshot);
  const paid = isPaid(order);
  const items = (order.order_items || []).map(item =>
    '<div class="order-item-row"><div><strong>' + escapeHtml(item.product_name || item.product_code || "Produto") + "</strong><p>" +
    escapeHtml([item.size, item.product_code, item.quantity ? item.quantity + " un." : ""].filter(Boolean).join(" · ")) +
    (item.item_notes ? "<br>" + escapeHtml(item.item_notes) : "") + "</p></div><strong>" +
    money(Number(item.unit_price_cents || 0) * Number(item.quantity || 0)) + "</strong></div>"
  ).join("") || '<p class="gallery-help">Itens não disponíveis para este pedido.</p>';

  let actions = '<p class="gallery-help">O status operacional só pode ser alterado depois que o pagamento estiver confirmado.</p>';
  if (paid && ["paid_pending_seller", "in_progress", "shipped"].includes(String(order.order_status))) {
    actions = '<div class="order-status-actions">';
    if (order.order_status === "paid_pending_seller") {
      actions += '<button type="button" class="primary-button" data-update-order="in_progress" data-order-id="' + escapeHtml(order.id) + '">Em preparação</button>';
      actions += '<button type="button" class="secondary-button" data-update-order="shipped" data-order-id="' + escapeHtml(order.id) + '">Enviado</button>';
    } else if (order.order_status === "in_progress") {
      actions += '<button type="button" class="primary-button" data-update-order="shipped" data-order-id="' + escapeHtml(order.id) + '">Marcar como enviado</button>';
    } else if (order.order_status === "shipped") {
      actions += '<p class="gallery-help">Pedido enviado. Aguardando o cliente confirmar o recebimento.</p>';
    }
    actions += "</div>";
  } else if (order.order_status === "completed") {
    actions = '<p class="gallery-help">O cliente confirmou o recebimento deste pedido.</p>';
  }

  $("#order-detail-content").innerHTML =
    '<div class="order-detail-grid">' +
      '<div class="detail-box"><span>Cliente</span><strong>' + escapeHtml(order.buyer_name || "Não informado") + "</strong></div>" +
      '<div class="detail-box"><span>Pagamento</span><strong><span class="status-pill ' + paymentTone(order.payment_status) + '">' + escapeHtml(paymentLabel(order.payment_status)) + "</span></strong></div>" +
      '<div class="detail-box"><span>Status do pedido</span><strong><span class="status-pill ' + orderTone(order.order_status) + '">' + escapeHtml(statusLabel(order.order_status)) + "</span></strong></div>" +
      '<div class="detail-box"><span>Data do pedido</span><strong>' + escapeHtml(formatDate(order.created_at)) + "</strong></div>" +
      '<div class="detail-box"><span>E-mail</span><strong>' + escapeHtml(order.email || "Não informado") + "</strong></div>" +
      '<div class="detail-box"><span>Telefone</span><strong>' + escapeHtml(order.phone || "Não informado") + "</strong></div>" +
      '<div class="detail-box"><span>Entrega ou retirada</span><strong>' + (order.fulfillment_method === "delivery" ? "Entrega" : "Retirada") + "</strong></div>" +
      '<div class="detail-box"><span>Endereço</span><strong>' + escapeHtml(order.fulfillment_method === "delivery" ? (address || "Não informado") : "Retirada combinada com o cliente") + "</strong></div>" +
    "</div><h3>Itens do pedido</h3><div class=\"order-items-list\">" + items + "</div>" +
    '<div class="order-detail-grid" style="margin-top:18px"><div class="detail-box"><span>Subtotal</span><strong>' + money(order.subtotal_cents) + "</strong></div>" +
    '<div class="detail-box"><span>Frete</span><strong>' + money(order.shipping_cents) + "</strong></div>" +
    '<div class="detail-box"><span>' + (paid ? "Total pago" : "Total do pedido") + '</span><strong>' + money(order.total_cents) + "</strong></div></div>" +
    (order.customer_notes ? '<div class="detail-box"><span>Observações do cliente</span><strong>' + escapeHtml(order.customer_notes) + "</strong></div>" : "") +
    actions;

  $$("[data-update-order]", $("#order-detail-content")).forEach(button => {
    button.addEventListener("click", () => withLoader(async () => {
      const nextStatus = button.dataset.updateOrder;
      const orderId = button.dataset.orderId;
      const { error } = await supabase.from("orders")
        .update({ order_status: nextStatus })
        .eq("id", orderId);
      if (error) {
        notify("Não foi possível atualizar o pedido: " + error.message, true);
        return;
      }
      notify("Status atualizado para: " + statusLabel(nextStatus) + ".");
      closeModal("order-detail-dialog");
      await listOrders();
    }, "Atualizando pedido…"));
  });

  $("#order-detail-dialog").showModal();
}

const { data: { session } } = await supabase.auth.getSession();
if (session) {
  const { data: isAdmin, error } = await supabase.rpc("is_store_admin");
  if (!error && isAdmin === true) {
    admin = session.user;
    $("#admin-login").hidden = true;
    $("#admin-sidebar").hidden = false;
    $("#admin-app").hidden = false;
    await panel("products");
  }
}
