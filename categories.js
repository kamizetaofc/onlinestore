import { supabase, escapeHTML, toast, withTimeout } from './supabaseClient.js';

const normalize = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLocaleLowerCase('pt-BR')
  .replace(/\s+/g, ' ');

export async function loadCategories(el, open) {
  el.innerHTML = '<p class="muted">Carregando categorias…</p>';
  try {
    const { data, error } = await withTimeout(
      supabase.from('categories').select('id,name,cover_image_url').order('name'),
      12000,
      'Tempo esgotado ao carregar categorias.'
    );
    if (error) throw error;
    if (!data?.length) {
      el.innerHTML = '<p class="muted">Nenhuma categoria cadastrada ainda.</p>';
      return;
    }

    el.innerHTML = data.map(category =>
      '<button type="button" class="category-item" data-category="' + escapeHTML(category.name) + '">' +
        '<span class="category-image">' +
          (category.cover_image_url
            ? '<img loading="lazy" src="' + escapeHTML(category.cover_image_url) + '" alt="">'
            : 'K.') +
        '</span><span>' + escapeHTML(category.name) + '</span>' +
      '</button>'
    ).join('');

    el.querySelectorAll('[data-category]').forEach(button => {
      button.onclick = () => open(button.dataset.category);
    });
  } catch (error) {
    console.error('Erro ao carregar categorias:', error);
    el.innerHTML = '<p class="muted category-error">Não foi possível carregar as categorias. <button type="button" id="retry-categories" class="secondary">Tentar novamente</button></p>';
    el.querySelector('#retry-categories').onclick = () => loadCategories(el, open);
  }
}

async function readCategoryProducts(category) {
  const pageSize = 100;
  const exact = [];
  let start = 0;

  // Primeiro consulta apenas a categoria selecionada: evita baixar e filtrar
  // todo o catálogo no navegador.
  while (true) {
    const { data, error } = await withTimeout(
      supabase.from('products')
        .select('id,name,image_url,description,price_cents,category,created_at')
        .eq('is_published', true)
        .eq('category', category)
        .order('created_at', { ascending: false })
        .range(start, start + pageSize - 1),
      12000,
      'Tempo esgotado ao carregar os produtos desta categoria.'
    );
    if (error) throw error;
    const page = data || [];
    exact.push(...page);
    if (page.length < pageSize) break;
    start += pageSize;
  }

  if (exact.length) return exact;

  // Compatibilidade com produtos antigos cujo campo category difere apenas
  // por acentos, espaços ou caixa.
  const normalizedMatches = [];
  start = 0;
  while (true) {
    const { data, error } = await withTimeout(
      supabase.from('products')
        .select('id,name,image_url,description,price_cents,category,created_at')
        .eq('is_published', true)
        .order('created_at', { ascending: false })
        .range(start, start + pageSize - 1),
      12000,
      'Tempo esgotado ao localizar produtos da categoria.'
    );
    if (error) throw error;
    const page = data || [];
    normalizedMatches.push(...page.filter(product => normalize(product.category) === normalize(category)));
    if (page.length < pageSize) break;
    start += pageSize;
  }
  return normalizedMatches;
}

export async function openCategoryStories(category) {
  const dialog = document.querySelector('#info-dialog');
  const content = document.querySelector('#info-content');

  content.innerHTML =
    '<header class="category-products-header"><h2>' + escapeHTML(category) + '</h2>' +
    '<p class="muted">Carregando produtos…</p></header>';
  dialog.classList.add('category-product-dialog');
  dialog.addEventListener('close', () => dialog.classList.remove('category-product-dialog'), { once: true });
  if (!dialog.open) dialog.showModal();

  try {
    const products = await readCategoryProducts(category);
    if (!dialog.open) return;

    if (!products.length) {
      content.innerHTML =
        '<h2>' + escapeHTML(category) + '</h2>' +
        '<p class="muted">Ainda não há produtos publicados nesta categoria.</p>';
      return;
    }

    const ids = products.map(product => product.id);
    const { data: images, error: imageError } = await withTimeout(
      supabase.from('product_images')
        .select('product_id,image_url,position')
        .in('product_id', ids)
        .order('position', { ascending: true }),
      12000,
      'Tempo esgotado ao carregar imagens dos produtos.'
    ).catch(error => ({ data: null, error }));

    if (imageError) console.warn('Imagens adicionais não carregadas:', imageError);
    const firstImage = new Map();
    for (const image of images || []) {
      if (!firstImage.has(image.product_id)) firstImage.set(image.product_id, image.image_url);
    }

    content.innerHTML =
      '<header class="category-products-header"><div><h2>' + escapeHTML(category) + '</h2>' +
      '<p class="muted">' + products.length + (products.length === 1 ? ' produto' : ' produtos') + '</p></div></header>' +
      '<div class="category-products-grid">' + products.map(product => {
        const image = firstImage.get(product.id) || product.image_url;
        return '<button type="button" class="category-product-tile" data-open-product="' + escapeHTML(product.id) + '" aria-label="Ver ' + escapeHTML(product.name) + '">' +
          (image
            ? '<img loading="lazy" src="' + escapeHTML(image) + '" alt="' + escapeHTML(product.name) + '">'
            : '<span class="category-product-placeholder">Sem imagem</span>') +
          '<span class="category-product-caption"><b>' + escapeHTML(product.name) + '</b></span>' +
        '</button>';
      }).join('') + '</div>';

    content.querySelectorAll('[data-open-product]').forEach(button => {
      button.onclick = async () => {
        const productId = button.dataset.openProduct;
        dialog.close();
        const { openProduct } = await import('./feed.js');
        await openProduct(productId);
      };
    });
  } catch (error) {
    console.error('Erro ao abrir categoria:', error);
    if (!dialog.open) return;
    content.innerHTML =
      '<h2>' + escapeHTML(category) + '</h2>' +
      '<p class="muted">Não foi possível carregar os produtos desta categoria.</p>' +
      '<button id="retry-category-products" type="button" class="secondary">Tentar novamente</button>';
    content.querySelector('#retry-category-products').onclick = () => openCategoryStories(category);
  }
}
