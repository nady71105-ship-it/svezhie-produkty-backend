// ── Свежие продукты · логика мини-аппа ────────────────────────────────
// Один файл, без сборки: DOM выше уже разметил все экраны (index.html),
// здесь только данные и поведение. Все запросы идут к тому же самому
// хосту (та же деплойка отдаёт и API, и статику — см. server.js).

import { CATEGORY_META, categoryIcon } from './icons.js';

const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
if (tg) {
  tg.ready();
  tg.expand();
}
const initData = tg ? tg.initData : '';

// ── Состояние ───────────────────────────────────────────────────────────
const state = {
  categories: [],                 // [{slug, title}]
  listingsById: new Map(),        // id -> объявление (из последнего поиска/mine)
  filters: { category: null, topSellers: false, sort: 'created_desc', radius_km: 5 },
  view: 'map',
  userLoc: null,                  // {lat, lng}
  screenStack: ['home'],
  me: null,
  create: {
    category: null,
    origin: null,                 // {lat,lng}
    dest: null,                   // {lat,lng}
    window: null,                 // {start,end,label} (ISO строки)
    photoDataUrl: null,           // data:image/jpeg;base64,... (уже сжатое)
  },
  sellerReviewCtx: null,          // {sellerId, listingId} — если открыли профиль продавца из карточки товара
};

// ── Хелперы DOM ─────────────────────────────────────────────────────────
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

let toastTimer = null;
function showToast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

// ── API ─────────────────────────────────────────────────────────────────
async function api(path, { method = 'GET', body, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers['x-telegram-init-data'] = initData || '';
  const res = await fetch(path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch (_) { /* пустой ответ */ }
  if (!res.ok) {
    const msg = (data && data.error) || `Ошибка запроса (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

// ── Окно согласия (публикация объявления / начало переписки) ───────────
// Текст — не наш, а с сервера (см. GET /consents/text) — так его нельзя
// подменить на клиенте, и мы всегда показываем ровно то, что реально
// сохранится в журнале согласий при подтверждении.
function askConsent(context) {
  return new Promise((resolve) => {
    const overlay = $('#consentModal');
    const textEl = $('#consentText');
    const confirmBtn = $('#consentConfirm');
    const cancelBtn = $('#consentCancel');

    textEl.textContent = 'Загрузка…';
    overlay.hidden = false;
    api(`/consents/text?context=${encodeURIComponent(context)}`)
      .then((res) => { textEl.textContent = res.text; })
      .catch(() => { textEl.textContent = 'Не удалось загрузить текст согласия. Проверьте связь и попробуйте ещё раз.'; });

    function cleanup(result) {
      overlay.hidden = true;
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    }
    function onConfirm() { cleanup(true); }
    function onCancel() { cleanup(false); }
    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
  });
}

// Пишем факт согласия в журнал на сервере (см. src/routes/consents.js —
// там же и объяснение, зачем это нужно). Если запись технически не
// удалась, действие всё равно не блокируем — это была бы слишком жёсткая
// расплата пользователя за наш сбой, — но честно предупреждаем тостом.
async function recordConsent(context, listingId) {
  try {
    await api('/consents', { method: 'POST', auth: true, body: { context, listing_id: listingId || undefined } });
  } catch (e) {
    showToast('Не удалось сохранить подтверждение согласия — попробуйте ещё раз позже');
  }
}

// ── Навигация между экранами ──────────────────────────────────────────
function showScreen(name, { push = true } = {}) {
  $$('.screen').forEach((s) => { s.hidden = s.id !== `screen-${name}`; });
  $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  if (push && state.screenStack[state.screenStack.length - 1] !== name) {
    state.screenStack.push(name);
  }
  closeSheet();
}
function goBack() {
  state.screenStack.pop();
  const prev = state.screenStack[state.screenStack.length - 1] || 'home';
  showScreen(prev, { push: false });
}

$$('.backbtn').forEach((b) => b.addEventListener('click', goBack));
$$('.tab').forEach((b) => b.addEventListener('click', () => {
  state.screenStack = [b.dataset.tab];
  showScreen(b.dataset.tab, { push: false });
  if (b.dataset.tab === 'profile') loadProfile();
  if (b.dataset.tab === 'create') openCreateScreen();
}));

// ── Категории (общие для фильтра и формы создания) ─────────────────────
async function loadCategories() {
  state.categories = await api('/categories');
}

function categoryTitle(slug) {
  const c = state.categories.find((c) => c.slug === slug);
  return c ? c.title : slug;
}

// ── Экран «Главная» ──────────────────────────────────────────────────────
function renderFilterRow() {
  const row = $('#filterRow');
  row.innerHTML = '';

  const allChip = el('button', 'fchip' + (state.filters.category ? '' : ' active'), 'Все');
  allChip.addEventListener('click', () => { state.filters.category = null; renderFilterRow(); loadHome(); });
  row.appendChild(allChip);

  state.categories.forEach((c) => {
    const active = state.filters.category === c.slug;
    const chip = el('button', 'fchip' + (active ? ' active' : ''), c.title);
    chip.addEventListener('click', () => {
      state.filters.category = active ? null : c.slug;
      renderFilterRow();
      loadHome();
    });
    row.appendChild(chip);
  });

  const topChip = el('button', 'fchip' + (state.filters.topSellers ? ' active' : ''), '★ Топ продавцы');
  topChip.addEventListener('click', () => {
    state.filters.topSellers = !state.filters.topSellers;
    renderFilterRow();
    loadHome();
  });
  row.appendChild(topChip);

  const sortLabels = {
    created_desc: 'Сначала новые',
    price_asc: 'Сначала дешевле',
    price_desc: 'Сначала дороже',
    rating_desc: 'По рейтингу',
    deals_desc: 'По числу сделок',
  };
  const sortChip = el('button', 'fchip', sortLabels[state.filters.sort]);
  sortChip.addEventListener('click', () => {
    const order = ['created_desc', 'price_asc', 'price_desc', 'rating_desc', 'deals_desc'];
    const i = order.indexOf(state.filters.sort);
    state.filters.sort = order[(i + 1) % order.length];
    renderFilterRow();
    loadHome();
  });
  row.appendChild(sortChip);
}

$$('.segment .opt').forEach((opt) => {
  opt.addEventListener('click', () => {
    state.view = opt.dataset.view;
    $$('.segment .opt').forEach((o) => o.classList.toggle('active', o === opt));
    $('#mapView').hidden = state.view !== 'map';
    $('#listView').hidden = state.view !== 'list';
    closeSheet();
    // Пока карта была display:none, Leaflet не мог измерить контейнер —
    // без этого после переключения обратно на «Карту» тайлы съезжают.
    if (state.view === 'map' && leafletMap) setTimeout(() => leafletMap.invalidateSize(), 0);
  });
});

$('#btnGeo').addEventListener('click', () => locateMe(true));

function locateMe(refresh) {
  if (!navigator.geolocation) {
    showToast('Геолокация недоступна в этом браузере');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.userLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      $('#locLabel').textContent = 'Ваше местоположение';
      if (refresh) {
        loadHome();
        if (leafletMap) leafletMap.flyTo([state.userLoc.lat, state.userLoc.lng], 13, { duration: 1 });
      }
    },
    () => {
      showToast('Не удалось определить местоположение — показываем без геопривязки');
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

async function loadHome() {
  $('#mapEmpty').hidden = true;
  const params = new URLSearchParams();
  if (state.userLoc) {
    params.set('lat', state.userLoc.lat);
    params.set('lng', state.userLoc.lng);
    params.set('radius_km', state.filters.radius_km);
  }
  if (state.filters.category) params.set('category', state.filters.category);
  if (state.filters.topSellers) params.set('topSellers', '1');
  params.set('sort', state.filters.sort);

  let listings = [];
  try {
    listings = await api(`/listings?${params.toString()}`);
  } catch (e) {
    showToast(e.message);
  }

  state.listingsById = new Map(listings.map((l) => [String(l.id), l]));
  renderMapMarkers(listings);
  renderList(listings);
}

// ── Настоящая интерактивная карта (Leaflet + OpenStreetMap) ────────────
// Свободные тайлы без ключа — удобно для теста и небольшой аудитории.
// Если/когда аудитория вырастет, стоит перейти на платного провайдера
// тайлов (Яндекс.Карты, 2ГИС, MapTiler) — see README.
const MOSCOW_CENTER = [55.7558, 37.6176];
let leafletMap = null;
let markerLayer = null;
let selectedMarker = null;

function initMap() {
  if (leafletMap) return;
  leafletMap = L.map('leafletMap', { zoomControl: false }).setView(MOSCOW_CENTER, 10);
  L.control.zoom({ position: 'bottomright' }).addTo(leafletMap);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap',
  }).addTo(leafletMap);
  markerLayer = L.layerGroup().addTo(leafletMap);
  leafletMap.on('click', () => closeSheet());
}

function renderMapMarkers(listings) {
  $('#mapEmpty').hidden = listings.length > 0;
  if (!leafletMap) return;
  markerLayer.clearLayers();
  selectedMarker = null;

  listings.forEach((l) => {
    if (l.dest_lat == null || l.dest_lng == null) return;
    const meta = CATEGORY_META[l.category_slug] || CATEGORY_META.other;
    const marker = L.marker([l.dest_lat, l.dest_lng], {
      icon: L.divIcon({
        className: 'leaflet-pin-wrap',
        html: `<div class="leaflet-pin"><div class="badge" style="background:${meta.bg}">${categoryIcon(l.category_slug)}</div><div class="price">${formatPrice(l.price)} ₽/${l.unit}</div></div>`,
        iconSize: [60, 60],
        iconAnchor: [30, 48],
      }),
    });
    marker.addTo(markerLayer);
    marker.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      selectMarker(marker);
      openSheet(l);
    });
  });
}

function selectMarker(marker) {
  if (selectedMarker) selectedMarker.getElement()?.querySelector('.leaflet-pin')?.classList.remove('selected');
  selectedMarker = marker;
  marker?.getElement()?.querySelector('.leaflet-pin')?.classList.add('selected');
}

// ── Поиск по адресу/метро (геокодер Nominatim/OpenStreetMap) ───────────
$('#btnMapSearch').addEventListener('click', () => {
  $('#mapSearchPanel').hidden = false;
  $('#mapSearchInput').focus();
});
$('#mapSearchCancel').addEventListener('click', () => { $('#mapSearchPanel').hidden = true; });
$('#mapSearchGo').addEventListener('click', doMapSearch);
$('#mapSearchInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') doMapSearch(); });

async function doMapSearch() {
  const q = $('#mapSearchInput').value.trim();
  if (!q || !leafletMap) return;
  const btn = $('#mapSearchGo');
  btn.disabled = true;
  try {
    // viewbox грубо ограничивает Москву и область — чтобы «Сокольники» не
    // нашлись где-нибудь в другом городе.
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ru&viewbox=36.4,56.4,38.8,55.0&bounded=1&q=${encodeURIComponent(q + ', Москва')}`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'ru' } });
    const results = await res.json();
    if (!results.length) {
      showToast('Не нашли такое место — попробуйте сформулировать иначе');
      return;
    }
    leafletMap.flyTo([Number(results[0].lat), Number(results[0].lon)], 14, { duration: 1.1 });
    $('#mapSearchPanel').hidden = true;
    $('#mapSearchInput').value = '';
  } catch (e) {
    showToast('Не удалось найти адрес — проверьте связь');
  } finally {
    btn.disabled = false;
  }
}

// ── Едущие машинки — декоративная анимация «продукты едут в Москву» ────
// Спавнятся у случайного края видимой области карты и едут к случайному
// товару (или к центру карты, если товаров нет), доехав — исчезают.
const CAR_EMOJIS = ['🚐', '🚚', '🚗'];
let activeCars = [];

function randomEdgePoint(bounds) {
  const n = bounds.getNorth(), s = bounds.getSouth(), e = bounds.getEast(), w = bounds.getWest();
  const side = Math.floor(Math.random() * 4);
  if (side === 0) return { lat: n, lng: w + Math.random() * (e - w) };
  if (side === 1) return { lat: s, lng: w + Math.random() * (e - w) };
  if (side === 2) return { lat: s + Math.random() * (n - s), lng: w };
  return { lat: s + Math.random() * (n - s), lng: e };
}

function pickCarTarget() {
  const listings = Array.from(state.listingsById.values()).filter((l) => l.dest_lat != null);
  if (listings.length) {
    const l = listings[Math.floor(Math.random() * listings.length)];
    return { lat: l.dest_lat, lng: l.dest_lng };
  }
  const c = leafletMap.getCenter();
  return { lat: c.lat, lng: c.lng };
}

function spawnCar() {
  if (!leafletMap || document.hidden || $('#screen-home').hidden || $('#mapView').hidden) return;
  if (activeCars.length >= 3) return;

  const bounds = leafletMap.getBounds();
  const start = randomEdgePoint(bounds);
  const target = pickCarTarget();
  const emoji = CAR_EMOJIS[Math.floor(Math.random() * CAR_EMOJIS.length)];
  const car = L.marker([start.lat, start.lng], {
    icon: L.divIcon({ className: 'car-pin-wrap', html: `<div class="car-pin">${emoji}</div>`, iconSize: [24, 24] }),
    interactive: false,
    keyboard: false,
    zIndexOffset: -200,
  }).addTo(leafletMap);
  activeCars.push(car);

  const durationMs = 7000 + Math.random() * 5000;
  const t0 = performance.now();
  function step(now) {
    const t = Math.min(1, (now - t0) / durationMs);
    car.setLatLng([start.lat + (target.lat - start.lat) * t, start.lng + (target.lng - start.lng) * t]);
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      leafletMap.removeLayer(car);
      activeCars = activeCars.filter((c) => c !== car);
    }
  }
  requestAnimationFrame(step);
}

function startCarAnimation() {
  spawnCar();
  setInterval(spawnCar, 3500);
}

function renderList(listings) {
  const list = $('#listView');
  list.innerHTML = '';
  if (!listings.length) {
    list.appendChild(el('div', 'empty-state', 'Пока ничего не найдено — попробуйте изменить фильтры'));
    return;
  }
  listings.forEach((l) => {
    const meta = CATEGORY_META[l.category_slug] || CATEGORY_META.other;
    const item = el('button', 'item');
    item.innerHTML = `
      <div class="ithumb" style="background:${meta.bg}">${categoryIcon(l.category_slug)}</div>
      <div>
        <div class="ititle">${escapeHtml(l.title)}</div>
        <div class="iprice">${formatPrice(l.price)} ₽ / ${escapeHtml(l.unit)}</div>
        <div class="imeta">${escapeHtml(l.seller_name || 'Продавец')} · ${formatWindow(l.window_start, l.window_end)}</div>
        <div class="irating">★ ${Number(l.seller_rating || 0).toFixed(1)} · ${l.seller_deals || 0} сделок</div>
      </div>
    `;
    item.addEventListener('click', () => openDetail(l));
    list.appendChild(item);
  });
}

function openSheet(listing) {
  const sheet = $('#sheet');
  const meta = CATEGORY_META[listing.category_slug] || CATEGORY_META.other;
  sheet.innerHTML = `
    <div class="peek">
      <span>${escapeHtml(categoryTitle(listing.category_slug))}</span>
      <button class="closex" id="sheetClose">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>
      </button>
    </div>
    <div class="card-row" style="margin-top:10px;">
      <div class="thumb" style="background:${meta.bg}">${categoryIcon(listing.category_slug)}</div>
      <div>
        <div class="ctitle">${escapeHtml(listing.title)}</div>
        <div class="cmeta">${formatPrice(listing.price)} ₽ / ${escapeHtml(listing.unit)} · ${formatWindow(listing.window_start, listing.window_end)}</div>
      </div>
    </div>
    <div class="seller">★ ${Number(listing.seller_rating || 0).toFixed(1)} · ${escapeHtml(listing.seller_name || 'Продавец')} · ${listing.seller_deals || 0} сделок</div>
    <button class="writebtn" id="sheetDetail">Подробнее</button>
  `;
  sheet.hidden = false;
  $('#sheetClose').addEventListener('click', closeSheet);
  $('#sheetDetail').addEventListener('click', () => openDetail(listing));
}
function closeSheet() {
  $('#sheet').hidden = true;
  if (selectedMarker) {
    selectedMarker.getElement()?.querySelector('.leaflet-pin')?.classList.remove('selected');
    selectedMarker = null;
  }
}

// ── Экран «Карточка товара» ───────────────────────────────────────────
function openDetail(listing) {
  state.listingsById.set(String(listing.id), listing);
  renderDetail(listing);
  showScreen('detail');
}

function renderDetail(l) {
  const meta = CATEGORY_META[l.category_slug] || CATEGORY_META.other;
  const body = $('#detailBody');
  body.innerHTML = `
    <div class="detail-hero" style="background:${meta.bg}">
      ${categoryIcon(l.category_slug)}
      <img src="/listings/${l.id}/photo" alt="" onerror="this.remove()">
    </div>
    <div>
      <div class="detail-title">${escapeHtml(l.title)}</div>
      <div class="detail-price">${formatPrice(l.price)} ₽ / ${escapeHtml(l.unit)}</div>
    </div>
    ${l.description ? `<div class="detail-desc">${escapeHtml(l.description)}</div>` : ''}
    <div class="detail-row">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="3" stroke="currentColor" stroke-width="1.8"/><path d="M8 3v4M16 3v4M3 10h18" stroke="currentColor" stroke-width="1.8"/></svg>
      ${formatWindow(l.window_start, l.window_end)}
    </div>
    <button class="seller-card" id="detailSeller" style="text-align:left;">
      <div class="avatar">${initials(l.seller_name)}</div>
      <div>
        <div style="font-weight:800;font-size:14px;">${escapeHtml(l.seller_name || 'Продавец')}</div>
        <div style="font-size:12px;color:var(--ink-soft);">★ ${Number(l.seller_rating || 0).toFixed(1)} · ${l.seller_deals || 0} сделок</div>
      </div>
    </button>
    <button class="btn-primary" id="detailContact">
      Написать продавцу
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M21 3L2 10l7 3 2 7 3-4 5 3 2-16Z" stroke="white" stroke-width="1.8" stroke-linejoin="round"/></svg>
    </button>
  `;
  $('#detailSeller').addEventListener('click', () => openSeller(l.seller_id, l.id));
  $('#detailContact').addEventListener('click', () => contactSeller(l.id));
}

async function contactSeller(listingId) {
  if (!initData) { showToast('Откройте мини-приложение через бота в Telegram'); return; }
  const agreed = await askConsent('contact_seller');
  if (!agreed) return;
  await recordConsent('contact_seller', listingId);
  try {
    const res = await api(`/listings/${listingId}/contact-click`, { method: 'POST', auth: true });
    if (res.contactAvailable && res.telegramLink) {
      if (tg && tg.openTelegramLink) tg.openTelegramLink(res.telegramLink);
      else window.open(res.telegramLink, '_blank');
    } else {
      showToast('Продавец пока не открыл свой контакт — попробуйте позже');
    }
  } catch (e) {
    showToast(e.message);
  }
}

// ── Экран «Профиль продавца» ─────────────────────────────────────────
async function openSeller(sellerId, listingId) {
  state.sellerReviewCtx = listingId ? { sellerId, listingId } : null;
  showScreen('seller');
  $('#sellerBody').innerHTML = '<div class="skeleton" style="height:120px;"></div>';
  try {
    const user = await api(`/users/${sellerId}`);
    renderSeller(user);
  } catch (e) {
    $('#sellerBody').innerHTML = '';
    showToast(e.message);
  }
}

function renderSeller(u) {
  const body = $('#sellerBody');
  body.innerHTML = `
    <div class="profile-head">
      <div class="avatar avatar-lg">${initials(u.first_name)}</div>
      <div>
        <div class="profile-name">${escapeHtml(u.first_name || 'Продавец')}</div>
        <div class="profile-sub">${u.username ? '@' + escapeHtml(u.username) : 'Продавец на «Свежих продуктах»'}</div>
      </div>
    </div>
    <div class="stat-row">
      <div class="stat-box"><div class="stat-num">★ ${Number(u.rating || 0).toFixed(1)}</div><div class="stat-label">Рейтинг</div></div>
      <div class="stat-box"><div class="stat-num">${u.deals_count || 0}</div><div class="stat-label">Сделок</div></div>
    </div>
    <div id="reviewFormWrap"></div>
    <div class="label">Отзывы</div>
    <div id="reviewsList" style="display:flex;flex-direction:column;gap:8px;"></div>
  `;

  const reviews = u.reviews || [];
  const list = $('#reviewsList');
  if (!reviews.length) {
    list.appendChild(el('div', 'empty-state', 'Отзывов пока нет'));
  } else {
    reviews.forEach((r) => {
      const card = el('div', 'review');
      card.innerHTML = `
        <div class="review-head"><span>${escapeHtml(r.author_name || 'Покупатель')}</span><span class="review-stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span></div>
        ${r.comment ? `<div class="review-comment">${escapeHtml(r.comment)}</div>` : ''}
        <div class="review-date">${formatDate(r.created_at)}</div>
      `;
      list.appendChild(card);
    });
  }

  if (state.sellerReviewCtx) {
    renderReviewForm();
  }
}

function renderReviewForm() {
  const wrap = $('#reviewFormWrap');
  let rating = 5;
  wrap.innerHTML = `
    <div class="label">Оставить отзыв об этой сделке</div>
    <div class="stars-pick" id="starsPick"></div>
    <input class="field" id="reviewComment" placeholder="Как всё прошло? (необязательно)" maxlength="300" style="margin-top:10px;">
    <button class="btn-secondary" id="submitReview" style="margin-top:10px;">Отправить отзыв</button>
  `;
  const starsWrap = $('#starsPick');
  function drawStars() {
    starsWrap.innerHTML = '';
    for (let i = 1; i <= 5; i++) {
      const b = el('button', 'star-btn', i <= rating
        ? '<svg viewBox="0 0 24 24" fill="oklch(78% 0.13 85)"><path d="M12 2l3.1 6.6 7.2.9-5.3 5 1.4 7.2L12 18l-6.4 3.7 1.4-7.2-5.3-5 7.2-.9Z"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="oklch(70% 0.02 90)" stroke-width="1.6"><path d="M12 2l3.1 6.6 7.2.9-5.3 5 1.4 7.2L12 18l-6.4 3.7 1.4-7.2-5.3-5 7.2-.9Z"/></svg>');
      b.addEventListener('click', () => { rating = i; drawStars(); });
      starsWrap.appendChild(b);
    }
  }
  drawStars();

  $('#submitReview').addEventListener('click', async () => {
    if (!initData) { showToast('Откройте мини-приложение через бота в Telegram'); return; }
    const { sellerId, listingId } = state.sellerReviewCtx;
    try {
      await api('/reviews', {
        method: 'POST',
        auth: true,
        body: { seller_id: sellerId, listing_id: listingId, rating, comment: $('#reviewComment').value.trim() || undefined },
      });
      showToast('Спасибо! Отзыв сохранён');
      state.sellerReviewCtx = null;
      openSeller(sellerId);
    } catch (e) {
      showToast(e.message);
    }
  });
}

// ── Экран «Разместить объявление» ────────────────────────────────────
function openCreateScreen() {
  if (!state.create.category && state.categories.length) {
    state.create.category = state.categories[0].slug;
  }
  renderCreateCategories();
  renderTimeChips();
  $('#createError').hidden = true;
}

function renderCreateCategories() {
  const row = $('#createCategories');
  row.innerHTML = '';
  state.categories.forEach((c) => {
    const meta = CATEGORY_META[c.slug] || CATEGORY_META.other;
    const active = state.create.category === c.slug;
    const chip = el('button', 'chip' + (active ? ' active' : ''));
    chip.style.setProperty('--c', meta.chip);
    chip.innerHTML = `<span class="chipicon">${categoryIcon(c.slug)}</span>${escapeHtml(c.title)}`;
    chip.addEventListener('click', () => {
      state.create.category = c.slug;
      renderCreateCategories();
    });
    row.appendChild(chip);
  });
}

function daySlot(dayOffset, fromHour, toHour, label) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, fromHour, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, toHour, 0, 0);
  return { label, start, end };
}

function buildTimeSlots() {
  const now = new Date();
  const candidates = [
    daySlot(0, 12, 15, 'Сегодня днём'),
    daySlot(0, 18, 21, 'Сегодня вечером'),
    daySlot(1, 9, 12, 'Завтра утром'),
    daySlot(1, 12, 18, 'Завтра днём'),
    daySlot(1, 18, 21, 'Завтра вечером'),
    daySlot(2, 9, 12, 'Послезавтра утром'),
  ];
  return candidates.filter((s) => s.start > now).slice(0, 4);
}

function renderTimeChips() {
  const row = $('#timeChips');
  row.innerHTML = '';
  buildTimeSlots().forEach((slot) => {
    const active = state.create.window && state.create.window.label === slot.label;
    const chip = el('button', 'timechip' + (active ? ' active' : ''), slot.label);
    chip.addEventListener('click', () => {
      state.create.window = { label: slot.label, start: slot.start.toISOString(), end: slot.end.toISOString() };
      renderTimeChips();
    });
    row.appendChild(chip);
  });
}

function pickGeo(kind) {
  if (!navigator.geolocation) { showToast('Геолокация недоступна в этом браузере'); return; }
  const valEl = kind === 'origin' ? $('#originVal') : $('#destVal');
  valEl.textContent = 'Определяем...';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      state.create[kind] = loc;
      valEl.textContent = `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`;
    },
    () => { valEl.textContent = 'не удалось определить'; showToast('Не удалось определить местоположение'); },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}
$('#btnOrigin').addEventListener('click', () => pickGeo('origin'));
$('#btnDest').addEventListener('click', () => pickGeo('dest'));

// ── Фото урожая (необязательно) ──────────────────────────────────────
// Сжимаем прямо на клиенте через canvas, прежде чем отправлять —
// присланное с телефона фото 4000×3000 иначе разнесло бы и запрос, и базу.
$('#btnPickPhoto').addEventListener('click', () => $('#fPhoto').click());
$('#btnRemovePhoto').addEventListener('click', () => {
  state.create.photoDataUrl = null;
  $('#photoPreviewWrap').hidden = true;
  $('#btnPickPhoto').hidden = false;
});
$('#fPhoto').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const dataUrl = await resizeImageToDataUrl(file, 1280, 0.75);
    state.create.photoDataUrl = dataUrl;
    $('#photoPreview').src = dataUrl;
    $('#photoPreviewWrap').hidden = false;
    $('#btnPickPhoto').hidden = true;
  } catch (err) {
    showToast('Не удалось обработать фото — попробуйте другое');
  }
});

function resizeImageToDataUrl(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function resetCreateForm() {
  $('#fTitle').value = '';
  $('#fDescription').value = '';
  $('#fPrice').value = '';
  $('#originVal').textContent = 'не указано';
  $('#destVal').textContent = 'не указано';
  $('#photoPreviewWrap').hidden = true;
  $('#btnPickPhoto').hidden = false;
  state.create.origin = null;
  state.create.dest = null;
  state.create.window = null;
  state.create.photoDataUrl = null;
  renderTimeChips();
}

$('#btnPublish').addEventListener('click', async () => {
  if (!initData) { showToast('Откройте мини-приложение через бота в Telegram'); return; }
  const errEl = $('#createError');
  errEl.hidden = true;

  const title = $('#fTitle').value.trim();
  const description = $('#fDescription').value.trim();
  const price = Number($('#fPrice').value);
  const unit = $('#fUnit').value;
  const { category, origin, dest, window: win, photoDataUrl } = state.create;

  if (!category || !title || !price || !unit || !origin || !dest || !win) {
    errEl.textContent = 'Заполните название, цену, обе точки на маршруте и время выезда';
    errEl.hidden = false;
    return;
  }

  const agreed = await askConsent('create_listing');
  if (!agreed) return;

  $('#btnPublish').disabled = true;
  try {
    const created = await api('/listings', {
      method: 'POST',
      auth: true,
      body: {
        category_slug: category,
        title,
        description: description || undefined,
        price,
        unit,
        origin,
        dest,
        dest_radius_m: 1500,
        window_start: win.start,
        window_end: win.end,
        photo_data_url: photoDataUrl || undefined,
      },
    });
    recordConsent('create_listing', created.id);
    showToast('Объявление опубликовано!');
    resetCreateForm();
    state.screenStack = ['home'];
    showScreen('home', { push: false });
    loadHome();
  } catch (e) {
    errEl.textContent = e.message;
    errEl.hidden = false;
  } finally {
    $('#btnPublish').disabled = false;
  }
});

// ── Экран «Профиль» (свой) ────────────────────────────────────────────
async function loadProfile() {
  const body = $('#profileBody');
  if (!initData) {
    body.innerHTML = '<div class="empty-state">Откройте мини-приложение через бота в Telegram, чтобы увидеть профиль</div>';
    return;
  }
  body.innerHTML = '<div class="skeleton" style="height:80px;"></div>';
  try {
    const [me, mine] = await Promise.all([
      api('/users/me', { auth: true }),
      api('/listings/mine', { auth: true }),
    ]);
    state.me = me;
    renderProfile(me, mine);
  } catch (e) {
    body.innerHTML = '';
    showToast(e.message);
  }
}

const STATUS_LABEL = { active: 'Активно', archived: 'В архиве', reserved: 'Забронировано', sold: 'Продано' };

function renderProfile(me, mine) {
  const body = $('#profileBody');
  body.innerHTML = `
    <div class="profile-head">
      <div class="avatar avatar-lg">${initials(me.first_name)}</div>
      <div>
        <div class="profile-name">${escapeHtml(me.first_name || 'Вы')}</div>
        <div class="profile-sub">★ ${Number(me.rating || 0).toFixed(1)} · ${me.deals_count || 0} сделок</div>
      </div>
    </div>

    <div class="switch-row">
      <div>
        <div class="switch-text">Показывать контакт</div>
        <div class="switch-hint">Покупатели увидят ссылку на ваш Telegram при клике «Написать продавцу»</div>
      </div>
      <div class="switch${me.show_contact ? ' on' : ''}" id="swContact"></div>
    </div>

    <div class="switch-row">
      <div>
        <div class="switch-text">Рассылка новостей</div>
        <div class="switch-hint">Изредка присылаем важные объявления от «Свежих продуктов»</div>
      </div>
      <div class="switch${me.broadcast_opt_in ? ' on' : ''}" id="swBroadcast"></div>
    </div>

    <div class="label">Мои объявления</div>
    <div id="myListings" style="display:flex;flex-direction:column;gap:9px;"></div>
  `;

  $('#swContact').addEventListener('click', async (e) => {
    const on = !e.currentTarget.classList.contains('on');
    e.currentTarget.classList.toggle('on', on);
    try { await api('/users/me/show-contact', { method: 'PATCH', auth: true, body: { show_contact: on } }); }
    catch (err) { e.currentTarget.classList.toggle('on', !on); showToast(err.message); }
  });
  $('#swBroadcast').addEventListener('click', async (e) => {
    const on = !e.currentTarget.classList.contains('on');
    e.currentTarget.classList.toggle('on', on);
    try { await api('/users/me/broadcast-opt-in', { method: 'PATCH', auth: true, body: { broadcast_opt_in: on } }); }
    catch (err) { e.currentTarget.classList.toggle('on', !on); showToast(err.message); }
  });

  const wrap = $('#myListings');
  if (!mine.length) {
    wrap.appendChild(el('div', 'empty-state', 'Вы пока ничего не разместили'));
    return;
  }
  mine.forEach((l) => {
    const card = el('div', 'mylisting');
    const statusCls = `status-${l.status}`;
    card.innerHTML = `
      <div class="mylisting-top">
        <div>
          <div style="font-weight:800;font-size:14px;">${escapeHtml(l.title)}</div>
          <div style="font-size:12px;color:var(--ink-soft);margin-top:2px;">${formatPrice(l.price)} ₽ / ${escapeHtml(l.unit)} · ${formatWindow(l.window_start, l.window_end)}</div>
        </div>
        <span class="status-badge ${statusCls}">${STATUS_LABEL[l.status] || l.status}</span>
      </div>
    `;
    if (l.status === 'active') {
      const btn = el('button', 'archivebtn', 'Отправить в архив');
      btn.addEventListener('click', async () => {
        try {
          await api(`/listings/${l.id}/archive`, { method: 'POST', auth: true });
          loadProfile();
        } catch (e) { showToast(e.message); }
      });
      card.appendChild(btn);
    }
    wrap.appendChild(card);
  });
}

// ── Форматирование ────────────────────────────────────────────────────
function formatPrice(p) {
  return Number(p).toLocaleString('ru-RU');
}
function formatDate(iso) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}
function formatWindow(startIso, endIso) {
  const s = new Date(startIso), e = new Date(endIso);
  const now = new Date();
  const dayLabel = (d) => {
    const sameDay = d.toDateString() === now.toDateString();
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
    if (sameDay) return 'сегодня';
    if (d.toDateString() === tomorrow.toDateString()) return 'завтра';
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  };
  const time = (d) => d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return `${dayLabel(s)}, ${time(s)}–${time(e)}`;
}
function initials(name) {
  if (!name) return '?';
  return name.trim().slice(0, 1).toUpperCase();
}
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── Запуск ─────────────────────────────────────────────────────────────
async function boot() {
  try {
    await loadCategories();
  } catch (e) {
    showToast('Не удалось загрузить категории — проверьте связь');
  }
  renderFilterRow();
  locateMe(false);
  await loadHome();

  $('#splash').style.display = 'none';
  $('#app').hidden = false;

  // Карту создаём только теперь: пока #app скрыт (display:none), контейнер
  // имеет нулевой размер, и Leaflet посчитал бы себя нерабочим 0×0.
  initMap();
  renderMapMarkers(Array.from(state.listingsById.values()));
  leafletMap.invalidateSize();
  startCarAnimation();

  if (!initData) {
    showToast('Вы открыли страницу вне Telegram — часть функций (создание объявлений, профиль) будет недоступна');
  }
}

boot();
