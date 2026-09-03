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
    originLabel: null,            // краткая подпись адреса/метро (для отображения)
    destLabel: null,
    window: null,                 // {start,end,label} (ISO строки)
    photoDataUrl: null,           // data:image/jpeg;base64,... (уже сжатое)
    giveaway: false,              // «отдам даром» — цена необязательна
    photoNudged: false,           // шарик-подсказку про фото показываем один раз за сессию формы
  },
  meAccepted: null,               // null пока не проверено, иначе boolean — принял ли пользователь условия
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

// Подсвечивает/снимает подсветку с конкретного обязательного поля —
// красим только то, чего реально не хватает, а не форму целиком.
function markInvalid(elOrWrap, invalid = true) {
  if (!elOrWrap) return;
  elOrWrap.classList.toggle('field-invalid', invalid);
  elOrWrap.classList.toggle('invalid', invalid);
}
function clearFieldErrors() {
  ['#fTitle', '#fPrice', '#originInput', '#destInput'].forEach((sel) => markInvalid($(sel), false));
  markInvalid($('#timeSection'), false);
}

// ── Шарик-подсказка: всплывает, медленно улетает вверх, свайпается ─────
// Используем и для «вот чего не хватает», и для дружеского напоминания про
// фото — вместо того чтобы прятать это в обычный тост.
function showBalloon(text) {
  const outer = $('#balloonToast');
  const inner = $('#balloonDrag');
  $('#balloonMsg').textContent = text;
  if (outer._anim) outer._anim.cancel();
  clearTimeout(outer._hideTimer);
  inner.style.transform = '';
  outer.classList.add('balloon-active');
  outer.hidden = false;
  // Раньше шарик успевал долететь и растаять за ~5 секунд — не успевали
  // прочитать текст. Теперь: быстро появляется, долго и почти неподвижно
  // висит (есть время прочитать), и только потом медленно улетает вверх.
  const anim = outer.animate([
    { bottom: '110px', opacity: 0 },
    { bottom: '140px', opacity: 1, offset: 0.06 },
    { bottom: '160px', opacity: 1, offset: 0.74 },
    { bottom: '520px', opacity: 1, offset: 0.93 },
    { bottom: '620px', opacity: 0 },
  ], { duration: 9500, easing: 'ease-in', fill: 'forwards' });
  outer._anim = anim;
  anim.onfinish = () => {
    outer.hidden = true;
    outer.classList.remove('balloon-active');
  };
}
function dismissBalloon(dir) {
  const outer = $('#balloonToast');
  const inner = $('#balloonDrag');
  if (outer._anim) outer._anim.pause();
  inner.animate(
    [{ transform: inner.style.transform || 'translateX(0px) rotate(0deg)' }, { transform: `translateX(${dir * 320}px) rotate(${dir * 34}deg)` }],
    { duration: 260, easing: 'ease-in', fill: 'forwards' }
  ).onfinish = () => {
    outer.hidden = true;
    outer.classList.remove('balloon-active');
    inner.style.transform = '';
    if (outer._anim) outer._anim.cancel();
  };
}
(function setupBalloonSwipe() {
  const inner = $('#balloonDrag');
  let dragging = false, startX = 0, dx = 0;
  inner.addEventListener('pointerdown', (e) => {
    dragging = true; startX = e.clientX; dx = 0;
    inner.style.cursor = 'grabbing';
    inner.setPointerCapture(e.pointerId);
  });
  inner.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    dx = e.clientX - startX;
    inner.style.transform = `translateX(${dx}px) rotate(${dx / 10}deg)`;
  });
  function endDrag() {
    if (!dragging) return;
    dragging = false;
    inner.style.cursor = 'grab';
    if (Math.abs(dx) > 60) dismissBalloon(dx > 0 ? 1 : -1);
    else inner.style.transform = '';
  }
  inner.addEventListener('pointerup', endDrag);
  inner.addEventListener('pointercancel', endDrag);
})();

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

// ── Мини-регистрация: разовое пользовательское соглашение ──────────────
// Раньше показывали это блокирующим окном сразу при запуске — Надя
// попросила по-другому: не мешать людям просто посмотреть карту, а
// спрашивать согласие ровно в момент первого реального действия —
// публикации объявления или попытки написать продавцу. Поэтому это не
// вызывается из boot(), а дожидается вызова из этих двух мест (см.
// $('#btnPublish') и contactSeller()) через ensureTermsAccepted().
//
// Принятие фиксируется и в журнале согласий (тот же механизм, что и для
// create_listing/contact_seller — см. consents.js), и отдельной отметкой
// на пользователе (users.terms_accepted_at), чтобы не спрашивать заново.
let termsCheckPromise = null;
async function ensureTermsAccepted() {
  if (!initData) return true; // вне Telegram всё равно нечем проверить/сохранить
  try {
    if (!termsCheckPromise) termsCheckPromise = api('/users/me', { auth: true });
    const me = await termsCheckPromise;
    state.me = me;
    if (me.terms_accepted_at) return true;
  } catch (e) {
    termsCheckPromise = null;
    return true; // не смогли проверить — не блокируем действие пользователя
  }

  const overlay = $('#termsGate');
  const textEl = $('#termsText');
  textEl.textContent = 'Загрузка…';
  overlay.hidden = false;
  try {
    const res = await api('/consents/text?context=terms_of_use');
    textEl.textContent = res.text;
  } catch (e) {
    textEl.textContent = 'Не удалось загрузить текст соглашения. Проверьте связь и попробуйте ещё раз.';
  }

  return new Promise((resolve) => {
    $('#termsAccept').addEventListener('click', async function onAccept() {
      $('#termsAccept').removeEventListener('click', onAccept);
      try {
        await api('/consents', { method: 'POST', auth: true, body: { context: 'terms_of_use' } });
        overlay.hidden = true;
        if (state.me) state.me.terms_accepted_at = new Date().toISOString();
        resolve(true);
      } catch (e) {
        showToast('Не удалось сохранить согласие — проверьте связь и попробуйте ещё раз');
        resolve(false);
      }
    });
  });
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
  if (b.dataset.tab === 'home') {
    // По нажатию «Главная» всегда возвращаемся на карту, а не остаёмся
    // на «Списке», если переключались туда раньше в этой сессии.
    state.view = 'map';
    $$('.segment .opt').forEach((o) => o.classList.toggle('active', o.dataset.view === 'map'));
    $('#mapView').hidden = false;
    $('#listView').hidden = true;
    if (leafletMap) setTimeout(() => leafletMap.invalidateSize(), 0);
  }
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

// ── Маркетинговые подсказки над картой — для покупателя и для продавца,
// чередуются, чтобы обе поместились в одну строчку и не отвлекали. ─────
const HOME_HINTS = [
  '🛒 Выбери продукт — и на карте сразу загорится ближайшее место, где его можно забрать',
  '🌾 Есть урожай? Закинь его на карту — и привези свой урожай соседу!',
];
function startHomeHints() {
  const hintEl = $('#homeHint');
  let i = 0;
  const show = () => { hintEl.style.opacity = '0'; setTimeout(() => { hintEl.textContent = HOME_HINTS[i % HOME_HINTS.length]; hintEl.style.opacity = '1'; i++; }, 220); };
  show();
  setInterval(show, 6000);
}

// ── Счётчик «сколько уже перевезли соседям» — пока условные цифры для
// примера (см. обсуждение с Надей), потом заменим на реальную агрегацию
// по факту доставленных объявлений. ─────────────────────────────────────
function renderHomeCounter() {
  // Разметка и текст уже готовы в index.html — здесь только сами числа
  // (сейчас условные, потом заменим на реальную агрегацию по сделкам).
  $('#homeCounterKg').textContent = '≈1 240 кг';
  $('#homeCounterL').textContent = '≈340 л';
}

// ── Рецепты и заготовки — круглая кнопка в шапке главного экрана.
// Полноценный раздел с фото/видео — отдельная большая фича на будущее
// (обсуждали с Надей отдельно); пока — короткие карточки-подсказки по
// сезону и заготовкам, чтобы кнопка уже сейчас была живой и полезной.
const RECIPE_TIPS = [
  '🍅 Много помидоров? Прокрутите с чесноком и хреном — простая аджика без варки хранится в холодильнике до весны.',
  '🥒 Огурцы, которые чуть переросли — отличная малосольная закуска: залейте рассолом с укропом и чесноком на сутки.',
  '🫐 Ягоды на зиму — просто заморозьте одним слоем на подносе, а потом ссыпьте в пакет: не слипнутся.',
  '🌿 Зелень с запасом — вымойте, обсушите, мелко нарежьте и заморозьте порционно в формочках для льда с водой.',
  '🍯 Мёд засахарился? Это нормально — растопите баночку на водяной бане при слабом нагреве, не в микроволновке.',
  '🥕 Морковь и свёкла хранятся дольше, если срезать ботву сразу и держать в прохладном тёмном месте.',
];
let recipeTipIndex = 0;
function showRecipeTip() {
  $('#recipesText').textContent = RECIPE_TIPS[recipeTipIndex % RECIPE_TIPS.length];
  recipeTipIndex++;
}
$('#btnRecipes').addEventListener('click', () => {
  $('#recipesDot').hidden = true;
  showRecipeTip();
  $('#recipesSheet').hidden = false;
});
$('#recipesNext').addEventListener('click', showRecipeTip);
$('#recipesClose').addEventListener('click', () => { $('#recipesSheet').hidden = true; });

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
// Тайлы — CARTO Voyager: свободные, без ключа, но раздаются с их CDN,
// а не с ограниченных для продакшна серверов *.tile.openstreetmap.org
// (это и быстрее/плавнее, и корректнее по политике использования OSM).
// Если/когда аудитория вырастет, стоит перейти на платного провайдера
// тайлов (Яндекс.Карты, 2ГИС, MapTiler) — see README.
const MOSCOW_CENTER = [55.7558, 37.6176];
let leafletMap = null;
let markerLayer = null;
let selectedMarker = null;

function initMap() {
  if (leafletMap) return;
  // Зум 9, а не 10 — старт с менее детального обзора всего региона;
  // детали (дома, мелкие улицы) подгружаются сами по мере приближения —
  // так и работают любые тайловые карты, но именно так и просила Надя.
  leafletMap = L.map('leafletMap', { zoomControl: false }).setView(MOSCOW_CENTER, 9);
  L.control.zoom({ position: 'bottomright' }).addTo(leafletMap);
  // CARTO's voyager-стиль теперь требует свой API-ключ (без него тайлы
  // приходят с водяным знаком «API KEY REQUIRED») — возвращаемся на
  // обычные тайлы OpenStreetMap, они бесплатны и не требуют ключа.
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    subdomains: 'abc',
    attribution: '© OpenStreetMap',
  }).addTo(leafletMap);
  // Убираем фирменную приписку «Leaflet» из подвала карты — оставляем
  // только обязательную атрибуцию OSM/CARTO, без ссылки на leafletjs.com.
  leafletMap.attributionControl.setPrefix(false);
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
        html: `<div class="leaflet-pin"><div class="badge" style="background:${meta.bg}">${categoryIcon(l.category_slug)}</div><div class="price${Number(l.price) === 0 ? ' price-free' : ''}">${Number(l.price) === 0 ? 'ДАРОМ' : `${formatPrice(l.price)} ₽/${l.unit}`}</div></div>`,
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
// Живые подсказки по мере ввода — как в навигаторе: печатаешь несколько
// букв, снизу всплывает список, тап по варианту — переход. Никакой
// автоподстановки геолокации устройства без явного выбора пользователя.
async function nominatimSearch(query) {
  // viewbox грубо ограничивает Москву и область — чтобы «Сокольники» не
  // нашлись где-нибудь в другом городе. addressdetails=1 — чтобы можно было
  // собрать короткую подпись (см. shortLocationLabel) вместо длинного
  // «Раменское, ... , Центральный федеральный округ, 140100, Россия».
  const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&countrycodes=ru&viewbox=36.4,56.4,38.8,55.0&bounded=1&q=${encodeURIComponent(query + ', Москва')}`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'ru' } });
  const results = await res.json();
  return results.map((r) => ({
    lat: Number(r.lat),
    lng: Number(r.lon),
    label: shortLocationLabel(r),
    fullLabel: r.display_name,
  }));
}

// Из подробного ответа Nominatim собираем короткую подпись — станцию метро
// («метро Сокольники») или ближайший населённый пункт/район («Солнечногорск»,
// «Раменское») — вместо полного адреса со страной, округом и индексом.
function shortLocationLabel(r) {
  const a = r.address || {};
  const isStation = r.class === 'railway' || r.class === 'public_transport' || a.station;
  if (isStation) {
    const stationName = a.station || (r.display_name || '').split(',')[0].trim();
    return `метро ${stationName}`;
  }
  const short = a.village || a.town || a.city || a.suburb || a.city_district
    || a.municipality || a.county || (r.display_name || '').split(',')[0].trim();
  // Если нашли конкретную улицу/дом, а не просто населённый пункт — подпись
  // всё равно оставляем короткой (сам населённый пункт), этого достаточно,
  // чтобы понять, откуда/куда, не перегружая карточку адресом целиком.
  return short || (r.display_name || '').split(',')[0].trim();
}

// Вешает на текстовое поле живой автокомплит с выпадающим списком.
// onPick({lat,lng,label}) вызывается и при выборе адреса из списка,
// и при явном тапе на «моё текущее местоположение» (если allowMyLocation).
function attachAddressAutocomplete(inputEl, suggestEl, { allowMyLocation = false, onPick }) {
  let debounceTimer = null;
  let requestSeq = 0;

  function renderItems(items) {
    suggestEl.innerHTML = '';
    items.forEach((item) => {
      const row = el('button', 'geo-suggest-item');
      row.type = 'button';
      row.innerHTML = `<span class="geo-suggest-icon">${item.icon || '📍'}</span><span>${escapeHtml(item.label)}</span>`;
      row.addEventListener('click', () => {
        if (item.useMyLocation) {
          if (!navigator.geolocation) { showToast('Геолокация недоступна в этом браузере'); return; }
          inputEl.value = 'Определяем...';
          suggestEl.hidden = true;
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'Моё текущее местоположение' };
              inputEl.value = loc.label;
              onPick(loc);
            },
            () => { inputEl.value = ''; showToast('Не удалось определить местоположение'); },
            { enableHighAccuracy: true, timeout: 8000 }
          );
          return;
        }
        inputEl.value = item.label;
        suggestEl.hidden = true;
        onPick(item);
      });
      suggestEl.appendChild(row);
    });
    suggestEl.hidden = items.length === 0;
  }

  inputEl.addEventListener('focus', () => {
    const q = inputEl.value.trim();
    if (!q && allowMyLocation) {
      renderItems([{ icon: '📍', label: 'Моё текущее местоположение', useMyLocation: true }]);
    }
  });

  inputEl.addEventListener('input', () => {
    const q = inputEl.value.trim();
    clearTimeout(debounceTimer);
    if (q.length < 3) {
      suggestEl.hidden = true;
      return;
    }
    const seq = ++requestSeq;
    debounceTimer = setTimeout(async () => {
      try {
        const items = await nominatimSearch(q);
        if (seq !== requestSeq) return; // ответ на устаревший запрос — игнорируем
        renderItems(items);
      } catch (e) {
        suggestEl.hidden = true;
      }
    }, 350);
  });

  document.addEventListener('click', (e) => {
    if (e.target !== inputEl && !suggestEl.contains(e.target)) suggestEl.hidden = true;
  });
}

$('#btnMapSearch').addEventListener('click', () => {
  $('#mapSearchPanel').hidden = false;
  $('#mapSearchInput').focus();
});
$('#mapSearchCancel').addEventListener('click', () => {
  $('#mapSearchPanel').hidden = true;
  $('#mapSearchSuggest').hidden = true;
});
attachAddressAutocomplete($('#mapSearchInput'), $('#mapSearchSuggest'), {
  allowMyLocation: false,
  onPick: (loc) => {
    if (!leafletMap) return;
    leafletMap.flyTo([loc.lat, loc.lng], 14, { duration: 1.1 });
    $('#mapSearchPanel').hidden = true;
    $('#mapSearchInput').value = '';
  },
});

// ── Едущие машинки — декоративная анимация «продукты едут в Москву» ────
// Спавнятся у случайного края видимой области карты и едут к случайному
// товару (или к центру карты, если товаров нет), доехав — исчезают.
// Один и тот же грузовичок (силуэт), но в четырёх цветах — без маршрутки.
const CAR_COLORS = [
  'oklch(58% 0.19 29)',   // красный
  'oklch(55% 0.15 250)',  // синий
  'oklch(58% 0.15 145)',  // зелёный
  'oklch(80% 0.16 95)',   // жёлтый
];
function truckIconHtml(color) {
  return `<svg width="36" height="24" viewBox="0 0 36 24" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="6" width="20" height="11" rx="2.2" fill="${color}"/>
    <path d="M21 9.5h6.4c.55 0 1.06.28 1.36.74L31 14v3.3H21V9.5Z" fill="${color}"/>
    <rect x="24.5" y="11.2" width="4.4" height="3.2" rx="0.6" fill="oklch(93% 0.02 220)"/>
    <circle cx="8.5" cy="19" r="3.3" fill="oklch(22% 0.02 60)"/>
    <circle cx="8.5" cy="19" r="1.4" fill="oklch(90% 0.01 90)"/>
    <circle cx="26.5" cy="19" r="3.3" fill="oklch(22% 0.02 60)"/>
    <circle cx="26.5" cy="19" r="1.4" fill="oklch(90% 0.01 90)"/>
  </svg>`;
}
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

// Не больше 2 машинок одновременно, и двигаем их не на каждый кадр (60/сек
// тут ни к чему для медленно едущей точки), а ~12 раз в секунду — этого не
// видно на глаз, а нагрузка на слабых телефонах заметно ниже.
const CAR_STEP_MS = 80;

function spawnCar() {
  if (!leafletMap || document.hidden || $('#screen-home').hidden || $('#mapView').hidden) return;
  if (activeCars.length >= 2) return;

  const bounds = leafletMap.getBounds();
  const start = randomEdgePoint(bounds);
  const target = pickCarTarget();
  const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
  const car = L.marker([start.lat, start.lng], {
    icon: L.divIcon({ className: 'car-pin-wrap', html: `<div class="car-pin">${truckIconHtml(color)}</div>`, iconSize: [36, 24] }),
    interactive: false,
    keyboard: false,
    zIndexOffset: -200,
  }).addTo(leafletMap);
  activeCars.push(car);

  const durationMs = 7000 + Math.random() * 5000;
  const t0 = performance.now();
  let lastStep = 0;
  function step(now) {
    if (now - lastStep < CAR_STEP_MS) {
      if (activeCars.includes(car)) requestAnimationFrame(step);
      return;
    }
    lastStep = now;
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
  setInterval(spawnCar, 4500);
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
        <div class="iprice${Number(l.price) === 0 ? ' price-free' : ''}">${priceLabel(l.price, l.unit)}</div>
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
        <div class="cmeta">${priceLabel(listing.price, listing.unit)} · ${formatWindow(listing.window_start, listing.window_end)}</div>
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
      <div class="detail-price${Number(l.price) === 0 ? ' price-free' : ''}">${priceLabel(l.price, l.unit)}</div>
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
  const termsOk = await ensureTermsAccepted();
  if (!termsOk) return;
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

// ── «Отдам даром» — излишки урожая без цены ─────────────────────────────
$('#fGiveaway').addEventListener('change', (e) => {
  state.create.giveaway = e.target.checked;
  $('#priceRow').hidden = e.target.checked;
  $('#giveawayPhrases').hidden = !e.target.checked;
  if (e.target.checked) {
    $('#fPrice').value = '';
    markInvalid($('#fPrice'), false);
  }
});
$$('.phrase-chip').forEach((btn) => {
  btn.addEventListener('click', () => {
    const desc = $('#fDescription');
    desc.value = btn.dataset.phrase;
  });
});

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
  // Своя дата показываем не голой меткой, а красиво отформатированным
  // диапазоном — тем же способом, что и в карточке.
  if (state.create.window && state.create.window.label === 'Своя дата') {
    const w = state.create.window;
    const chip = el('button', 'timechip active timechip-custom', `🗓 ${formatWindow(w.start, w.end)}`);
    chip.addEventListener('click', () => {
      $('#customTimeForm').hidden = false;
      updateCustomTimePreview();
    });
    row.appendChild(chip);
  }
}

// Точки маршрута — теперь только через поиск метро/адреса (живые
// подсказки, см. attachAddressAutocomplete выше), без автоматического
// подхвата геолокации устройства: Надя жаловалась, что раньше жать на
// поле означало «система сама подставляет моё местоположение» — теперь
// нужно явно ввести адрес или явно тапнуть «моё текущее местоположение».
attachAddressAutocomplete($('#originInput'), $('#originSuggest'), {
  allowMyLocation: true,
  onPick: (loc) => {
    state.create.origin = { lat: loc.lat, lng: loc.lng };
    state.create.originLabel = loc.label;
  },
});
attachAddressAutocomplete($('#destInput'), $('#destSuggest'), {
  allowMyLocation: true,
  onPick: (loc) => {
    state.create.dest = { lat: loc.lat, lng: loc.lng };
    state.create.destLabel = loc.label;
  },
});

// ── Своя дата выезда (в дополнение к готовым чипам) ──────────────────────
// Раньше это был один комбинированный datetime-local «С»/«До» — на телефоне
// такой инпут вводит дату и время как одну строку и легко сбивается на
// частичном вводе (жаловались: ввели «18», а осталось только «19»). Теперь
// дата и время — отдельные, простые поля: дата обязательна (один день или
// период из двух дат), время — необязательное уточнение.
function pad2(n) { return String(n).padStart(2, '0'); }
function dateInputValue(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function parseDateInput(v) {
  const [y, m, d] = v.split('-').map(Number);
  return { y, m, d };
}
function isPeriodMode() { return $('#drOptPeriod').classList.contains('active'); }

function setPeriodMode(period) {
  $('#drOptOneDay').classList.toggle('active', !period);
  $('#drOptPeriod').classList.toggle('active', period);
  $('#dateEndWrap').hidden = !period;
  updateCustomTimePreview();
}
$('#drOptOneDay').addEventListener('click', () => setPeriodMode(false));
$('#drOptPeriod').addEventListener('click', () => {
  setPeriodMode(true);
  if (!$('#customDateEnd').value) $('#customDateEnd').value = $('#customDateStart').value;
});

// Собирает {start,end} Date из полей формы, либо null, если дата ещё не
// выбрана или диапазон некорректен. Время необязательно: если не указано,
// берём начало/конец суток соответствующего дня.
function buildCustomWindow() {
  const dStartVal = $('#customDateStart').value;
  if (!dStartVal) return null;
  const dEndVal = isPeriodMode() ? ($('#customDateEnd').value || dStartVal) : dStartVal;
  const { y: sy, m: sm, d: sd } = parseDateInput(dStartVal);
  const { y: ey, m: em, d: ed } = parseDateInput(dEndVal);
  const tStartVal = $('#customTimeStart').value;
  const tEndVal = $('#customTimeEnd').value;
  let start, end;
  if (tStartVal) {
    const [sh, smin] = tStartVal.split(':').map(Number);
    start = new Date(sy, sm - 1, sd, sh, smin, 0);
  } else {
    start = new Date(sy, sm - 1, sd, 0, 0, 0);
  }
  if (tEndVal) {
    const [eh, emin] = tEndVal.split(':').map(Number);
    end = new Date(ey, em - 1, ed, eh, emin, 0);
  } else {
    end = new Date(ey, em - 1, ed, 23, 59, 0);
  }
  if (end <= start) return null;
  return { start, end };
}
function formatCustomWindowLabel() {
  const dStartVal = $('#customDateStart').value;
  if (!dStartVal) return '';
  const dEndVal = isPeriodMode() ? ($('#customDateEnd').value || dStartVal) : dStartVal;
  const dfmt = (v) => {
    const { y, m, d } = parseDateInput(v);
    return new Date(y, m - 1, d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  };
  let label = dfmt(dStartVal);
  if (dEndVal !== dStartVal) label += `–${dfmt(dEndVal)}`;
  const tStartVal = $('#customTimeStart').value;
  const tEndVal = $('#customTimeEnd').value;
  if (tStartVal && tEndVal) label += `, ${tStartVal}–${tEndVal}`;
  else if (tStartVal) label += `, с ${tStartVal}`;
  else if (tEndVal) label += `, до ${tEndVal}`;
  return label;
}
function updateCustomTimePreview() {
  const preview = $('#customTimePreview');
  const w = buildCustomWindow();
  preview.textContent = w ? `🗓 ${formatCustomWindowLabel()}` : '';
}

$('#btnCustomTime').addEventListener('click', () => {
  const form = $('#customTimeForm');
  form.hidden = !form.hidden;
  if (!form.hidden && !$('#customDateStart').value) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    $('#customDateStart').value = dateInputValue(tomorrow);
    setPeriodMode(false);
    updateCustomTimePreview();
  }
});
// И input, и change — на мобильных вебвью нативные date/time-пикеры не
// всегда стабильно шлют input, надёжнее слушать оба события.
$$('#customTimeForm input').forEach((inp) => {
  inp.addEventListener('input', updateCustomTimePreview);
  inp.addEventListener('change', updateCustomTimePreview);
});

$('#btnCustomTimeApply').addEventListener('click', () => {
  const w = buildCustomWindow();
  if (!w) {
    showToast($('#customDateStart').value ? 'Дата/время указаны некорректно — «по» должно быть позже «с»' : 'Укажите дату');
    return;
  }
  state.create.window = { label: 'Своя дата', start: w.start.toISOString(), end: w.end.toISOString() };
  markInvalid($('#timeSection'), false);
  renderTimeChips();
  $('#customTimeForm').hidden = true;
  showToast('Дата выезда указана');
});

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
  $('#originInput').value = '';
  $('#destInput').value = '';
  $('#photoPreviewWrap').hidden = true;
  $('#btnPickPhoto').hidden = false;
  $('#customTimeForm').hidden = true;
  $('#customDateStart').value = '';
  $('#customDateEnd').value = '';
  $('#customTimeStart').value = '';
  $('#customTimeEnd').value = '';
  $('#customTimePreview').textContent = '';
  setPeriodMode(false);
  $('#fGiveaway').checked = false;
  $('#priceRow').hidden = false;
  $('#giveawayPhrases').hidden = true;
  state.create.origin = null;
  state.create.dest = null;
  state.create.originLabel = null;
  state.create.destLabel = null;
  state.create.window = null;
  state.create.photoDataUrl = null;
  state.create.giveaway = false;
  state.create.photoNudged = false;
  clearFieldErrors();
  renderTimeChips();
}

$('#btnPublish').addEventListener('click', async () => {
  if (!initData) { showToast('Откройте мини-приложение через бота в Telegram'); return; }
  const errEl = $('#createError');
  errEl.hidden = true;
  clearFieldErrors();

  const title = $('#fTitle').value.trim();
  const description = $('#fDescription').value.trim();
  const price = state.create.giveaway ? 0 : Number($('#fPrice').value);
  const unit = $('#fUnit').value;
  const { category, origin, dest, window: win, photoDataUrl, giveaway } = state.create;

  // Подсвечиваем ТОЛЬКО реально незаполненные обязательные поля — не форму
  // целиком, — и в сообщении перечисляем именно их, а не общую фразу.
  const missing = [];
  if (!title) { missing.push('название'); markInvalid($('#fTitle')); }
  if (!giveaway && !(price > 0)) { missing.push('цену (или отметьте «Отдам даром»)'); markInvalid($('#fPrice')); }
  if (!origin) { missing.push('точку «откуда»'); markInvalid($('#originInput')); }
  if (!dest) { missing.push('точку «куда»'); markInvalid($('#destInput')); }
  if (!win) { missing.push('дату выезда'); markInvalid($('#timeSection')); }

  if (missing.length || !category) {
    const msg = category ? `Заполните: ${missing.join(', ')}` : 'Заполните название, цену, обе точки на маршруте и дату выезда';
    errEl.textContent = msg;
    errEl.hidden = false;
    showBalloon(missing.length === 1 ? `Не хватает: ${missing[0]}` : msg);
    return;
  }

  // Мягкая разовая подсказка про фото — не блокирует публикацию, просто
  // напоминает один раз за визит на этот экран, что с фото товар охотнее
  // и быстрее покупают. Повторное нажатие «Опубликовать» публикует как есть.
  if (!photoDataUrl && !state.create.photoNudged) {
    state.create.photoNudged = true;
    showBalloon('📸 Добавьте фото — так товар покупают охотнее и быстрее!');
    return;
  }

  const termsOk = await ensureTermsAccepted();
  if (!termsOk) return;
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
    // Данные для красивой карточки-подтверждения берём из того, что сами
    // только что отправили (сервер в ответ отдаёт только id/created_at) —
    // и фото показываем сразу из уже готового data:URL, без похода на сервер.
    const published = {
      id: created.id,
      category_slug: category,
      title,
      description,
      price,
      unit,
      window_start: win.start,
      window_end: win.end,
      originLabel: state.create.originLabel,
      destLabel: state.create.destLabel,
      photoDataUrl,
    };
    resetCreateForm();
    loadHome();
    renderPublishedCard(published);
    state.screenStack = ['home'];
    showScreen('published', { push: true });
  } catch (e) {
    errEl.textContent = e.message;
    errEl.hidden = false;
  } finally {
    $('#btnPublish').disabled = false;
  }
});

// ── Экран «Объявление опубликовано» — красивое подтверждение ──────────
function renderPublishedCard(l) {
  const meta = CATEGORY_META[l.category_slug] || CATEGORY_META.other;
  const body = $('#publishedBody');
  // По умолчанию — иконка категории на цветном фоне; если приложили фото,
  // оно просто перекрывает иконку (см. .detail-hero img { position:absolute }).
  const photoHtml = l.photoDataUrl ? `<img src="${l.photoDataUrl}" alt="">` : '';
  const hasRoute = l.originLabel || l.destLabel;
  body.innerHTML = `
    <div class="published-badge">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M7.5 12.5l3 3 6-6.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Объявление опубликовано и уже видно на карте
    </div>
    <div class="detail-hero" style="background:${meta.bg}">
      ${categoryIcon(l.category_slug)}
      ${photoHtml}
    </div>
    <div>
      <div class="detail-title">${escapeHtml(l.title)}</div>
      <div class="detail-price${Number(l.price) === 0 ? ' price-free' : ''}">${priceLabel(l.price, l.unit)}</div>
    </div>
    ${l.description ? `<div class="published-desc">${escapeHtml(l.description)}</div>` : ''}
    <div class="published-row detail-row">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="16" rx="3" stroke="currentColor" stroke-width="1.8"/><path d="M8 3v4M16 3v4M3 10h18" stroke="currentColor" stroke-width="1.8"/></svg>
      ${formatWindow(l.window_start, l.window_end)}
    </div>
    ${hasRoute ? `
      <div class="route-viz">
        <div class="route-line">
          <span class="route-house">🏠</span>
          <span class="route-truck">${truckIconHtml(CAR_COLORS[0])}</span>
          <span class="route-pin">📍</span>
        </div>
        <div class="route-labels">
          <span>🏠 ${escapeHtml(l.originLabel || '—')}</span>
          <span>${escapeHtml(l.destLabel || '—')} 📍</span>
        </div>
      </div>` : ''}
    <button class="btn-primary" id="publishedDone">На главную</button>
  `;
  $('#publishedDone').addEventListener('click', () => {
    state.screenStack = ['home'];
    showScreen('home', { push: false });
  });
}

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

    <div class="label">💬 Чаты</div>
    <div class="chats-note">Переписка с покупателями и продавцами идёт прямо в Telegram — откройте карточку товара и нажмите «Написать продавцу», чат откроется в обычном Telegram-чате.</div>

    <div class="label">📦 Мои продажи</div>
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
          <div style="font-size:12px;color:var(--ink-soft);margin-top:2px;">${priceLabel(l.price, l.unit)} · ${formatWindow(l.window_start, l.window_end)}</div>
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
// «Отдам даром» хранится как цена 0 — вместо «0 ₽» показываем бейдж.
function priceLabel(price, unit) {
  if (Number(price) === 0) return 'ДАРОМ';
  return `${formatPrice(price)} ₽ / ${escapeHtml(unit)}`;
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
  renderHomeCounter();
  startHomeHints();
  $('#recipesDot').hidden = false;
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
