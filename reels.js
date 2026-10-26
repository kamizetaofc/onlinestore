import { supabase, escapeHTML, toast } from './supabaseClient.js';

let reels = [];
let viewer = null;
let playerFrame = null;
let gestureLayer = null;
let reelIndex = 0;
let isMuted = true;
let isPlaying = true;
let touchStart = null;
let ignoreNextTap = false;
let loadSequence = 0;

function youtubeId(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '');
    let id = null;

    if (host === 'youtu.be') {
      id = url.pathname.split('/').filter(Boolean)[0];
    } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      const parts = url.pathname.split('/').filter(Boolean);
      if (url.pathname === '/watch') id = url.searchParams.get('v');
      else if (['shorts', 'embed', 'live', 'v'].includes(parts[0])) id = parts[1];
    }

    return id && /^[a-zA-Z0-9_-]{6,20}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

function renderReelGrid(el) {
  if (!reels.length) {
    el.innerHTML = '<p class="muted reel-empty">Ainda não há Reels publicados.</p>';
    return;
  }

  el.innerHTML = reels.map((reel, index) => {
    const id = encodeURIComponent(reel.videoId);
    const title = escapeHTML(reel.name || 'Reel Kamizeta');
    return '<button type="button" class="reel-grid-card" data-reel-index="' + index + '" aria-label="Assistir ' + title + '">' +
      '<img loading="lazy" src="https://i.ytimg.com/vi/' + id + '/hqdefault.jpg" alt="" onerror="this.onerror=null;this.src=\'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg\'">' +
      '<span class="reel-grid-play" aria-hidden="true"><i class="fa-solid fa-play"></i></span>' +
      '<span class="reel-grid-caption">' + title + '</span>' +
    '</button>';
  }).join('');

  el.querySelectorAll('[data-reel-index]').forEach(button => {
    button.addEventListener('click', () => openReel(Number(button.dataset.reelIndex)));
  });
}

function ensureViewer() {
  if (viewer) return viewer;

  viewer = document.createElement('dialog');
  viewer.id = 'reel-viewer';
  viewer.className = 'reel-viewer';
  viewer.setAttribute('aria-label', 'Visualizador de Reels');
  viewer.innerHTML =
    '<button type="button" class="reel-viewer-close" data-action="close" aria-label="Fechar vídeo" title="Fechar">' +
      '<i class="fa-solid fa-xmark"></i>' +
    '</button>' +
    '<div class="reel-viewer-layout">' +
      '<div class="reel-player-column">' +
        '<iframe id="reel-player" title="Reel Kamizeta" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>' +
        '<div class="reel-gesture-layer" aria-label="Deslize para mudar de vídeo">' +
          '<span class="reel-paused-indicator" hidden><i class="fa-solid fa-play"></i></span>' +
        '</div>' +
      '</div>' +
      '<aside class="reel-viewer-controls" aria-label="Controles dos Reels">' +
        '<button type="button" data-action="previous" aria-label="Reel anterior" title="Reel anterior"><i class="fa-solid fa-chevron-up"></i></button>' +
        '<button type="button" data-action="next" aria-label="Próximo Reel" title="Próximo Reel"><i class="fa-solid fa-chevron-down"></i></button>' +
        '<button type="button" class="primary reel-view-product" data-action="product">Ver produto</button>' +
        '<button type="button" class="secondary reel-sound-button" data-action="mute" aria-pressed="false">Ativar som</button>' +
      '</aside>' +
    '</div>';

  document.body.append(viewer);
  playerFrame = viewer.querySelector('#reel-player');
  gestureLayer = viewer.querySelector('.reel-gesture-layer');

  viewer.querySelector('[data-action="close"]').addEventListener('click', () => viewer.close());
  viewer.querySelector('[data-action="previous"]').addEventListener('click', () => showReel(reelIndex - 1));
  viewer.querySelector('[data-action="next"]').addEventListener('click', () => showReel(reelIndex + 1));
  viewer.querySelector('[data-action="product"]').addEventListener('click', async () => {
    const reel = reels[reelIndex];
    if (!reel) return;
    viewer.close();
    const { openProduct } = await import('./feed.js');
    await openProduct(reel.id);
  });
  viewer.querySelector('[data-action="mute"]').addEventListener('click', () => {
    isMuted = !isMuted;
    sendPlayerCommand(isMuted ? 'mute' : 'unMute');
    updateViewerControls();
  });

  gestureLayer.addEventListener('touchstart', event => {
    const touch = event.changedTouches[0];
    touchStart = { x: touch.clientX, y: touch.clientY };
  }, { passive: true });

  gestureLayer.addEventListener('touchend', event => {
    if (!touchStart) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    touchStart = null;

    if (Math.abs(dy) > 45 && Math.abs(dy) > Math.abs(dx) * 1.15) {
      ignoreNextTap = true;
      showReel(reelIndex + (dy < 0 ? 1 : -1));
      window.setTimeout(() => { ignoreNextTap = false; }, 350);
    }
  }, { passive: true });

  gestureLayer.addEventListener('click', () => {
    if (ignoreNextTap) {
      ignoreNextTap = false;
      return;
    }
    isPlaying = !isPlaying;
    sendPlayerCommand(isPlaying ? 'playVideo' : 'pauseVideo');
    gestureLayer.classList.toggle('is-paused', !isPlaying);
    const indicator = gestureLayer.querySelector('.reel-paused-indicator');
    indicator.hidden = isPlaying;
  });

  viewer.addEventListener('keydown', event => {
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      showReel(reelIndex - 1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      showReel(reelIndex + 1);
    }
  });

  viewer.addEventListener('click', event => {
    if (event.target === viewer) viewer.close();
  });

  viewer.addEventListener('close', () => {
    if (playerFrame) playerFrame.src = 'about:blank';
    document.body.classList.remove('reel-viewer-open');
    touchStart = null;
    ignoreNextTap = false;
  });

  return viewer;
}

function sendPlayerCommand(func) {
  if (!playerFrame?.contentWindow) return;
  playerFrame.contentWindow.postMessage(
    JSON.stringify({ event: 'command', func, args: [] }),
    'https://www.youtube-nocookie.com'
  );
}

function updateViewerControls() {
  if (!viewer) return;
  const previous = viewer.querySelector('[data-action="previous"]');
  const next = viewer.querySelector('[data-action="next"]');
  const mute = viewer.querySelector('[data-action="mute"]');
  previous.disabled = reelIndex <= 0;
  next.disabled = reelIndex >= reels.length - 1;
  mute.textContent = isMuted ? 'Ativar som' : 'Mutar';
  mute.setAttribute('aria-pressed', String(!isMuted));
}

function showReel(nextIndex) {
  if (!viewer || !reels.length) return;
  const boundedIndex = Math.max(0, Math.min(reels.length - 1, nextIndex));
  if (boundedIndex === reelIndex && playerFrame.src && playerFrame.src !== 'about:blank') return;

  reelIndex = boundedIndex;
  const reel = reels[reelIndex];
  isMuted = true;
  isPlaying = true;
  gestureLayer.classList.remove('is-paused');
  gestureLayer.querySelector('.reel-paused-indicator').hidden = true;

  const params = new URLSearchParams({
    autoplay: '1',
    mute: '1',
    controls: window.matchMedia('(max-width: 700px)').matches ? '0' : '1',
    playsinline: '1',
    rel: '0',
    modestbranding: '1',
    enablejsapi: '1',
    origin: location.origin
  });
  playerFrame.title = reel.name || 'Reel Kamizeta';
  playerFrame.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(reel.videoId) + '?' + params.toString();
  viewer.querySelector('[data-action="product"]').dataset.productId = reel.id;
  updateViewerControls();
}

function openReel(index) {
  if (!reels.length) return;
  ensureViewer();
  reelIndex = -1;
  if (!viewer.open) viewer.showModal();
  document.body.classList.add('reel-viewer-open');
  showReel(index);
}

export async function loadReels() {
  const el = document.querySelector('#reels-view');
  const requestId = ++loadSequence;
  if (!el) return;

  el.innerHTML = '<p class="muted reel-loading">Carregando Reels…</p>';

  try {
    const all = [];
    const pageSize = 100;
    let start = 0;

    while (true) {
      const { data, error } = await supabase
        .from('products')
        .select('id,name,reel_url,created_at')
        .eq('is_published', true)
        .not('reel_url', 'is', null)
        .order('created_at', { ascending: false })
        .range(start, start + pageSize - 1);

      if (error) throw error;
      const page = data || [];
      all.push(...page);
      if (page.length < pageSize) break;
      start += pageSize;
    }

    if (requestId !== loadSequence) return;
    reels = all
      .map(product => ({ ...product, videoId: youtubeId(product.reel_url) }))
      .filter(product => product.videoId);

    renderReelGrid(el);
  } catch (error) {
    if (requestId !== loadSequence) return;
    console.error('Não foi possível carregar os Reels:', error);
    el.innerHTML = '<div class="feed-state"><p class="muted">Não foi possível carregar os Reels.</p><button type="button" class="secondary" id="retry-reels">Tentar novamente</button></div>';
    el.querySelector('#retry-reels')?.addEventListener('click', () => loadReels());
  }
}
