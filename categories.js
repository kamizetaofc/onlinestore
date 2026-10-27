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
    loadedCategoryNames = (data || []).map(category => category.name);
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
      button.onclick = () => open(button.dataset.category, loadedCategoryNames);
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

let loadedCategoryNames = [];

export async function openCategoryStories(category, categoryNames = loadedCategoryNames) {
  const dialog = document.querySelector('#info-dialog');
  const content = document.querySelector('#info-content');
  const orderedCategories = categoryNames.length ? categoryNames.slice() : [category];
  let categoryIndex = Math.max(0, orderedCategories.indexOf(category));
  let slides = [];
  let slideIndex = 0;
  let touchStartX = 0;
  let requestId = 0;

  dialog.classList.add('category-story-dialog');
  dialog.addEventListener('close', () => dialog.classList.remove('category-story-dialog'), { once: true });
  content.innerHTML = '<p class="muted">Carregando destaque…</p>';
  if (!dialog.open) dialog.showModal();

  async function loadSlides(name) {
    const products = await readCategoryProducts(name);
    if (!products.length) return [];
    const ids = products.map(product => product.id);
    const { data: images, error } = await withTimeout(
      supabase.from('product_images')
        .select('product_id,image_url,position')
        .in('product_id', ids)
        .order('position', { ascending: true }),
      12000,
      'Tempo esgotado ao carregar imagens do destaque.'
    ).catch(error => ({ data: null, error }));
    if (error) console.warn('Imagens adicionais não carregadas:', error);

    const byProduct = new Map();
    for (const image of images || []) {
      if (!byProduct.has(image.product_id)) byProduct.set(image.product_id, []);
      byProduct.get(image.product_id).push(image.image_url);
    }
    return products.flatMap(product => {
      const productImages = [...new Set([...(product.image_url ? [product.image_url] : []), ...(byProduct.get(product.id) || [])])];
      return (productImages.length ? productImages : [null]).map((image, imageIndex) => ({
        product,
        image,
        imageIndex,
        imageCount: productImages.length
      }));
    });
  }

  async function showCategory(index, requestedSlide = 0) {
    const currentRequest = ++requestId;
    categoryIndex = index;
    const name = orderedCategories[categoryIndex];
    content.innerHTML = '<p class="muted">Carregando destaque…</p>';
    try {
      const nextSlides = await loadSlides(name);
      if (!dialog.open || currentRequest !== requestId) return;
      slides = nextSlides;
      slideIndex = Math.max(0, Math.min(requestedSlide, slides.length - 1));
      if (!slides.length) {
        content.innerHTML = '<header class="category-story-header"><h2>' + escapeHTML(name) + '</h2></header><p class="muted">Ainda não há produtos publicados neste destaque.</p><button type="button" class="secondary" id="skip-category">Próximo destaque</button>';
        content.querySelector('#skip-category').onclick = nextCategory;
        return;
      }
      renderSlide();
    } catch (error) {
      console.error('Erro ao abrir destaque:', error);
      if (!dialog.open || currentRequest !== requestId) return;
      content.innerHTML = '<h2>' + escapeHTML(name) + '</h2><p class="muted">Não foi possível carregar este destaque.</p><button type="button" class="secondary" id="retry-category-story">Tentar novamente</button>';
      content.querySelector('#retry-category-story').onclick = () => showCategory(categoryIndex, slideIndex);
    }
  }

  function renderSlide() {
    const slide = slides[slideIndex];
    if (!slide) return;
    const product = slide.product;
    content.innerHTML =
      '<div class="category-story-viewer">' +
        '<header class="category-story-header"><div><p class="muted">DESTAQUE ' + (categoryIndex + 1) + ' DE ' + orderedCategories.length + '</p><h2>' + escapeHTML(orderedCategories[categoryIndex]) + '</h2></div>' +
        '<span class="category-story-count">' + (slideIndex + 1) + ' / ' + slides.length + '</span></header>' +
        '<div class="category-story-progress">' + slides.map((_, i) => '<span class="' + (i <= slideIndex ? 'seen' : '') + '"></span>').join('') + '</div>' +
        '<div class="category-story-media" id="category-story-media">' +
          (slide.image ? '<img src="' + escapeHTML(slide.image) + '" alt="' + escapeHTML(product.name) + '">' : '<div class="category-product-placeholder">Sem imagem disponível</div>') +
          (slides.length > 1 ? '<button type="button" class="category-image-arrow previous" id="category-story-prev" aria-label="Imagem anterior"><i class="fa-solid fa-chevron-left"></i></button><button type="button" class="category-image-arrow next" id="category-story-next" aria-label="Próxima imagem"><i class="fa-solid fa-chevron-right"></i></button>' : '') +
        '</div>' +
        '<div class="category-story-product"><div><b>' + escapeHTML(product.name) + '</b><p>' + escapeHTML(product.description || '') + '</p></div>' +
          '<button type="button" class="primary category-view-product" id="category-story-product">Ver produto</button></div>' +
      '</div>';

    content.querySelector('#category-story-prev')?.addEventListener('click', previousSlide);
    content.querySelector('#category-story-next')?.addEventListener('click', nextSlide);
    content.querySelector('#category-story-product').onclick = async () => {
      const productId = product.id;
      dialog.close();
      const { openProduct } = await import('./feed.js');
      await openProduct(productId);
    };
    const media = content.querySelector('#category-story-media');
    media.addEventListener('touchstart', event => { touchStartX = event.changedTouches[0].screenX; }, { passive: true });
    media.addEventListener('touchend', event => {
      const dx = event.changedTouches[0].screenX - touchStartX;
      if (Math.abs(dx) > 40) (dx < 0 ? nextSlide : previousSlide)();
    }, { passive: true });
  }

  function nextSlide() {
    if (slideIndex < slides.length - 1) {
      slideIndex += 1;
      renderSlide();
    } else {
      nextCategory();
    }
  }

  function previousSlide() {
    if (slideIndex > 0) {
      slideIndex -= 1;
      renderSlide();
    } else if (categoryIndex > 0) {
      showCategory(categoryIndex - 1, Number.MAX_SAFE_INTEGER);
    }
  }

  function nextCategory() {
    if (categoryIndex < orderedCategories.length - 1) showCategory(categoryIndex + 1, 0);
    else dialog.close();
  }

  await showCategory(categoryIndex, 0);
}
