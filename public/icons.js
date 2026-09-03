// Иконки категорий — те же, что в дизайн-макетах (IconSet.dc.html),
// перенесены как есть (объёмный стиль с градиентами вместо плоских
// силуэтов). Один <svg>...</svg> на категорию, viewBox 0 0 32 32.

export const CATEGORY_META = {
  vegetables: { bg: 'oklch(93% 0.05 29)', chip: 'oklch(58% 0.13 145)' },
  greens:     { bg: 'oklch(92% 0.05 145)', chip: 'oklch(55% 0.11 150)' },
  berries:    { bg: 'oklch(93% 0.05 10)',  chip: 'oklch(55% 0.17 10)' },
  eggs:       { bg: 'oklch(94% 0.03 85)',  chip: 'oklch(78% 0.13 85)' },
  meat:       { bg: 'oklch(93% 0.04 25)',  chip: 'oklch(48% 0.13 30)' },
  honey:      { bg: 'oklch(93% 0.06 70)',  chip: 'oklch(70% 0.14 70)' },
  fish:       { bg: 'oklch(92% 0.04 227)', chip: 'oklch(62% 0.11 227)' },
  flowers:    { bg: 'oklch(93% 0.05 350)', chip: 'oklch(66% 0.16 350)' },
  dairy:      { bg: 'oklch(94% 0.015 240)', chip: 'oklch(75% 0.03 90)' },
  other:      { bg: 'oklch(92% 0.02 60)',  chip: 'oklch(55% 0.03 60)' },
};

const ICONS = {
  vegetables: `<svg viewBox="0 0 32 32" width="100%" height="100%">
    <defs>
      <radialGradient id="icTomBodyG" cx="38%" cy="30%" r="75%">
        <stop offset="0%" stop-color="oklch(76% 0.15 33)"/><stop offset="45%" stop-color="oklch(60% 0.20 27)"/>
        <stop offset="80%" stop-color="oklch(46% 0.18 20)"/><stop offset="100%" stop-color="oklch(38% 0.14 18)"/>
      </radialGradient>
      <radialGradient id="icTomShineG" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="white" stop-opacity="0.85"/><stop offset="100%" stop-color="white" stop-opacity="0"/></radialGradient>
      <linearGradient id="icTomLeafG" x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stop-color="oklch(38% 0.10 145)"/><stop offset="100%" stop-color="oklch(62% 0.15 135)"/></linearGradient>
    </defs>
    <path d="M16 6.5 C20.5 6.3 24.3 9 25.4 13.2 C26.6 17.7 25.3 22 21.8 24.8 C19.6 26.6 17.7 27.1 16 27.1 C14.2 27.1 12.1 26.5 9.9 24.6 C6.6 21.7 5.4 17.5 6.6 13.1 C7.7 9 11.6 6.7 16 6.5 Z" fill="url(#icTomBodyG)"/>
    <ellipse cx="12" cy="13" rx="4.4" ry="3.2" fill="url(#icTomShineG)"/>
    <circle cx="10.8" cy="11.6" r="1" fill="white" opacity="0.75"/>
    <path d="M16 7.2 C15.4 5.6 15 3.6 16 1.8 C17 3.6 16.6 5.6 16 7.2 Z" fill="url(#icTomLeafG)" transform="rotate(0 16 7)"/>
    <path d="M16 7.2 C15.4 5.6 15 3.6 16 1.8 C17 3.6 16.6 5.6 16 7.2 Z" fill="url(#icTomLeafG)" transform="rotate(72 16 7)"/>
    <path d="M16 7.2 C15.4 5.6 15 3.6 16 1.8 C17 3.6 16.6 5.6 16 7.2 Z" fill="url(#icTomLeafG)" transform="rotate(144 16 7)"/>
    <path d="M16 7.2 C15.4 5.6 15 3.6 16 1.8 C17 3.6 16.6 5.6 16 7.2 Z" fill="url(#icTomLeafG)" transform="rotate(216 16 7)"/>
    <path d="M16 7.2 C15.4 5.6 15 3.6 16 1.8 C17 3.6 16.6 5.6 16 7.2 Z" fill="url(#icTomLeafG)" transform="rotate(288 16 7)"/>
    <circle cx="16" cy="7" r="1.6" fill="oklch(46% 0.12 140)"/>
  </svg>`,

  greens: `<svg viewBox="0 0 32 32" width="100%" height="100%" fill="none">
    <defs><linearGradient id="icLeafG" x1="0" y1="1" x2="0" y2="0"><stop offset="0%" stop-color="oklch(40% 0.1 150)"/><stop offset="100%" stop-color="oklch(64% 0.14 140)"/></linearGradient></defs>
    <path d="M16 28 L16 8" stroke="oklch(42% 0.09 145)" stroke-width="2" stroke-linecap="round"/>
    <path d="M16 12 C10 10 8 6 9 3 C13 4 16 8 16 12Z" fill="url(#icLeafG)"/>
    <path d="M16 18 C22 16 24 12 23 9 C19 10 16 14 16 18Z" fill="url(#icLeafG)"/>
    <path d="M16 24 C10 22 8 18 9 15 C13 16 16 20 16 24Z" fill="url(#icLeafG)"/>
  </svg>`,

  berries: `<svg viewBox="0 0 32 32" width="100%" height="100%">
    <defs><radialGradient id="icBerG" cx="35%" cy="28%" r="80%"><stop offset="0%" stop-color="oklch(68% 0.17 8)"/><stop offset="100%" stop-color="oklch(42% 0.15 5)"/></radialGradient></defs>
    <path d="M16 5 L13 2 L16 3.5 L19 1.5 L18 4.5Z" fill="oklch(45% 0.1 145)"/>
    <circle cx="12" cy="18" r="4.6" fill="url(#icBerG)"/><circle cx="20" cy="18" r="4.6" fill="url(#icBerG)"/><circle cx="16" cy="11" r="4.6" fill="url(#icBerG)"/>
    <circle cx="10.5" cy="16.5" r="0.8" fill="white" opacity="0.5"/><circle cx="18.5" cy="16.5" r="0.8" fill="white" opacity="0.5"/>
  </svg>`,

  eggs: `<svg viewBox="0 0 32 32" width="100%" height="100%">
    <defs><radialGradient id="icEggG" cx="35%" cy="25%" r="85%"><stop offset="0%" stop-color="oklch(97% 0.02 85)"/><stop offset="100%" stop-color="oklch(80% 0.06 80)"/></radialGradient></defs>
    <ellipse cx="16" cy="18" rx="9" ry="12" fill="url(#icEggG)" stroke="oklch(65% 0.06 80)" stroke-width="0.6"/>
    <circle cx="13" cy="13.5" r="0.9" fill="oklch(65% 0.05 80)" opacity="0.5"/><circle cx="19.5" cy="19" r="0.9" fill="oklch(65% 0.05 80)" opacity="0.5"/><circle cx="14" cy="23" r="0.9" fill="oklch(65% 0.05 80)" opacity="0.5"/>
  </svg>`,

  meat: `<svg viewBox="0 0 32 32" width="100%" height="100%">
    <defs><linearGradient id="icMeatG" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="oklch(74% 0.15 27)"/><stop offset="100%" stop-color="oklch(52% 0.15 24)"/></linearGradient></defs>
    <path d="M9 8 C6 11 6 21 10 25 C15 29 23 26 24 20 C25 14 21 8 15 7 C12.5 6.5 10.5 6.5 9 8Z" fill="url(#icMeatG)"/>
    <path d="M22 12 C27 12 29 16 27 19 C25 21.5 22 20 22 17Z" fill="oklch(96% 0.015 80)"/>
    <path d="M12 12 Q16 15 14 20 M15 11 Q19 15 17 21" stroke="oklch(94% 0.02 80)" stroke-width="1" opacity="0.6" fill="none"/>
    <ellipse cx="12.5" cy="13.5" rx="2.4" ry="1.6" fill="white" opacity="0.3"/>
  </svg>`,

  honey: `<svg viewBox="0 0 32 32" width="100%" height="100%">
    <defs>
      <linearGradient id="icBeeBodyG" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="oklch(78% 0.14 85)"/><stop offset="100%" stop-color="oklch(58% 0.15 65)"/></linearGradient>
      <radialGradient id="icWingG" cx="40%" cy="30%" r="80%"><stop offset="0%" stop-color="white" stop-opacity="0.9"/><stop offset="100%" stop-color="oklch(85% 0.03 227)" stop-opacity="0.55"/></radialGradient>
    </defs>
    <ellipse cx="14" cy="9.5" rx="5.2" ry="3.4" fill="url(#icWingG)" stroke="oklch(75% 0.03 227)" stroke-width="0.3" transform="rotate(-18 14 9.5)"/>
    <ellipse cx="20" cy="10.5" rx="4.4" ry="2.9" fill="url(#icWingG)" stroke="oklch(75% 0.03 227)" stroke-width="0.3" transform="rotate(14 20 10.5)"/>
    <path d="M16 15 C20.5 15 24 18.4 24 22.5 C24 26.3 20.5 28.5 16.8 28.5 C13.4 28.5 10.5 26 10.5 22 C10.5 18 12.5 15 16 15 Z" fill="url(#icBeeBodyG)"/>
    <path d="M11 19.5 C13.7 20.4 19.5 20.4 23.4 19.3" stroke="oklch(28% 0.02 60)" stroke-width="2" fill="none" opacity="0.88"/>
    <path d="M10.6 23 C13.6 24 20 24 23.9 22.8" stroke="oklch(28% 0.02 60)" stroke-width="2" fill="none" opacity="0.88"/>
    <circle cx="14.8" cy="12.6" r="3.6" fill="oklch(30% 0.03 60)"/><circle cx="10.2" cy="10" r="3.1" fill="oklch(24% 0.02 60)"/>
    <circle cx="9.1" cy="9.6" r="0.55" fill="white"/>
  </svg>`,

  fish: `<svg viewBox="0 0 32 32" width="100%" height="100%">
    <defs><linearGradient id="icFishG" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="oklch(80% 0.05 220)"/><stop offset="55%" stop-color="oklch(62% 0.11 227)"/><stop offset="100%" stop-color="oklch(42% 0.1 230)"/></linearGradient></defs>
    <path d="M14 8 L18.5 5.5 L17 10Z" fill="oklch(70% 0.07 220)"/>
    <path d="M4 18 C9 8 22 7 28 14 L23 18 L28 22 C22 25 9 24 4 18Z" fill="url(#icFishG)"/>
    <path d="M12 12 C15 15 15 21 12 24" stroke="oklch(88% 0.02 220)" stroke-width="0.8" opacity="0.5" fill="none"/>
    <circle cx="9.5" cy="16" r="1.5" fill="oklch(20% 0.02 90)"/><circle cx="9.9" cy="15.6" r="0.5" fill="white"/>
    <path d="M28 14 L32.5 10 L30 18 L32.5 26 L28 22Z" fill="oklch(50% 0.1 227)"/>
  </svg>`,

  flowers: `<svg viewBox="0 0 32 32" width="100%" height="100%">
    <defs>
      <radialGradient id="icFlPetalG" cx="50%" cy="90%" r="90%"><stop offset="0%" stop-color="oklch(58% 0.19 350)"/><stop offset="55%" stop-color="oklch(74% 0.14 352)"/><stop offset="100%" stop-color="oklch(88% 0.08 355)"/></radialGradient>
      <radialGradient id="icFlCenterG" cx="40%" cy="30%" r="80%"><stop offset="0%" stop-color="oklch(92% 0.09 90)"/><stop offset="100%" stop-color="oklch(64% 0.15 65)"/></radialGradient>
    </defs>
    <ellipse cx="16" cy="8.3" rx="4.3" ry="6.4" fill="url(#icFlPetalG)" transform="rotate(0 16 16)"/>
    <ellipse cx="16" cy="8.3" rx="4.3" ry="6.4" fill="url(#icFlPetalG)" transform="rotate(60 16 16)"/>
    <ellipse cx="16" cy="8.3" rx="4.3" ry="6.4" fill="url(#icFlPetalG)" transform="rotate(120 16 16)"/>
    <ellipse cx="16" cy="8.3" rx="4.3" ry="6.4" fill="url(#icFlPetalG)" transform="rotate(180 16 16)"/>
    <ellipse cx="16" cy="8.3" rx="4.3" ry="6.4" fill="url(#icFlPetalG)" transform="rotate(240 16 16)"/>
    <ellipse cx="16" cy="8.3" rx="4.3" ry="6.4" fill="url(#icFlPetalG)" transform="rotate(300 16 16)"/>
    <circle cx="16" cy="16" r="4.3" fill="url(#icFlCenterG)"/>
  </svg>`,

  dairy: `<svg viewBox="0 0 32 32" width="100%" height="100%">
    <defs><linearGradient id="icMilkG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="oklch(96% 0.01 240)"/><stop offset="100%" stop-color="oklch(75% 0.03 235)"/></linearGradient></defs>
    <rect x="13" y="3" width="6" height="6" rx="2" fill="oklch(60% 0.04 235)"/>
    <path d="M11 10 L21 10 L23 26 Q23 29 20 29 L12 29 Q9 29 9 26 Z" fill="url(#icMilkG)" stroke="oklch(65% 0.03 235)" stroke-width="0.5"/>
    <rect x="10.5" y="17" width="11" height="4" fill="oklch(58% 0.1 227)" opacity="0.85"/>
  </svg>`,

  other: `<svg viewBox="0 0 32 32" width="100%" height="100%" fill="none">
    <defs><linearGradient id="icBaskG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="oklch(62% 0.06 60)"/><stop offset="100%" stop-color="oklch(40% 0.05 55)"/></linearGradient></defs>
    <path d="M10 14 Q16 4 22 14" stroke="oklch(48% 0.05 55)" stroke-width="2.2"/>
    <path d="M6 14 L26 14 L23 26 Q16 28.5 9 26 Z" fill="url(#icBaskG)"/>
    <path d="M8 17 L24 17 M8.6 21 L23.4 21" stroke="oklch(30% 0.04 55)" stroke-width="0.6" opacity="0.4"/>
  </svg>`,
};

// Один и тот же slug (например «vegetables») одновременно рисуется в
// нескольких местах на странице — на карте, в списке, в чипах формы
// создания — и все они лежат в DOM одновременно (просто часть скрыта
// через [hidden]). Раньше все копии одной иконки использовали ОДИНАКОВЫЕ
// id для градиентов (id="icTomBodyG" и т.п.) — в WebKit (в том числе
// внутри Telegram на iOS) это иногда приводит к тому, что url(#icTomBodyG)
// у видимой копии не резолвится, если самая первая по DOM-порядку копия
// того же id лежит внутри скрытого (display:none) экрана — тогда иконка
// рисуется пустой/невидимой. Поэтому на каждый вызов делаем id уникальным.
let uidCounter = 0;
export function categoryIcon(slug) {
  const svg = ICONS[slug] || ICONS.other;
  const suffix = `_${uidCounter++}`;
  return svg
    .replace(/\bid="(ic[A-Za-z]+)"/g, (_m, name) => `id="${name}${suffix}"`)
    .replace(/url\(#(ic[A-Za-z]+)\)/g, (_m, name) => `url(#${name}${suffix})`);
}
