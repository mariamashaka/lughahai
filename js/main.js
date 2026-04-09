/**
 * LUGHA HAI — main.js
 * Общая логика: переключение языка, загрузка данных, утилиты.
 * Подключается на всех страницах: <script src="../js/main.js"></script>
 * (или <script src="js/main.js"></script> с главной)
 */

// ─────────────────────────────────────────────
// 1. LANGUAGE SWITCHER (SW / EN)
// ─────────────────────────────────────────────

const LH = window.LH || {};

/**
 * Текущий язык интерфейса. Берётся из localStorage,
 * по умолчанию суахили.
 */
LH.lang = localStorage.getItem('lh_lang') || 'sw';

/**
 * Применить язык: переключить кнопки и обновить все [data-i18n] элементы.
 * Каждая страница передаёт свой объект переводов i18n.
 *
 * Использование на странице:
 *   LH.applyLang('sw', i18n);
 */
LH.applyLang = function(lang, translations) {
  LH.lang = lang;
  localStorage.setItem('lh_lang', lang);

  // Toggle switcher buttons
  const btnSw = document.getElementById('btn-sw');
  const btnEn = document.getElementById('btn-en');
  if (btnSw) btnSw.classList.toggle('active', lang === 'sw');
  if (btnEn) btnEn.classList.toggle('active', lang === 'en');

  // Apply translations
  const t = translations[lang];
  if (!t) return;

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (t[key] !== undefined) el.textContent = t[key];
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (t[key] !== undefined) el.placeholder = t[key];
  });
};

// ─────────────────────────────────────────────
// 2. DATA LOADER
// ─────────────────────────────────────────────

/**
 * Загрузить languages.json.
 * Возвращает Promise с массивом языков.
 *
 * Использование:
 *   LH.loadLanguages('../data/languages.json').then(langs => { ... });
 */
LH.loadLanguages = function(path) {
  path = path || 'data/languages.json';
  return fetch(path)
    .then(r => r.json())
    .then(data => data.languages || [])
    .catch(err => {
      console.warn('LH: could not load languages.json, using empty array.', err);
      return [];
    });
};

// ─────────────────────────────────────────────
// 3. TOPIC HELPERS
// ─────────────────────────────────────────────

/**
 * Посчитать сколько тем готово в уровне.
 * lang    — объект языка из languages.json
 * levelId — 'A1', 'A2' и т.д.
 */
LH.countTopics = function(lang, levelId) {
  const level = lang.levels[levelId];
  if (!level || !level.active) return { done: 0, total: 0 };

  const all = [
    ...(level.grammar   || []),
    ...(level.vocabulary|| []),
    ...(level.phonetics || [])
  ];

  return {
    total:    all.length,
    done:     all.filter(t => t.status === 'approved').length,
    review:   all.filter(t => t.status === 'review').length,
    progress: all.filter(t => t.status === 'in_progress').length,
    pending:  all.filter(t => t.status === 'pending').length
  };
};

/**
 * Получить процент завершения уровня (0–100).
 */
LH.levelPercent = function(lang, levelId) {
  const c = LH.countTopics(lang, levelId);
  if (!c.total) return 0;
  return Math.round((c.done / c.total) * 100);
};

// ─────────────────────────────────────────────
// 4. DRAFT STORAGE  (localStorage)
// ─────────────────────────────────────────────

/**
 * Сохранить черновик темы.
 * topicId — id темы (напр. 'personal-pronouns')
 * data    — любой объект
 */
LH.saveDraft = function(topicId, data) {
  try {
    localStorage.setItem('lh_draft_' + topicId, JSON.stringify(data));
    return true;
  } catch(e) {
    console.warn('LH: could not save draft', e);
    return false;
  }
};

/**
 * Загрузить черновик темы. Возвращает объект или null.
 */
LH.loadDraft = function(topicId) {
  try {
    const raw = localStorage.getItem('lh_draft_' + topicId);
    return raw ? JSON.parse(raw) : null;
  } catch(e) {
    return null;
  }
};

/**
 * Удалить черновик после отправки на модерацию.
 */
LH.clearDraft = function(topicId) {
  localStorage.removeItem('lh_draft_' + topicId);
};

// ─────────────────────────────────────────────
// 5. UI UTILITIES
// ─────────────────────────────────────────────

/**
 * Показать кратковременное уведомление (toast).
 * message — текст
 * type    — 'success' | 'error' | 'info'  (по умолчанию success)
 */
LH.toast = function(message, type) {
  type = type || 'success';
  const colors = {
    success: { bg: 'var(--green-deep)',  color: 'var(--cream)' },
    error:   { bg: 'var(--terracotta)', color: 'var(--white)' },
    info:    { bg: '#1A5276',           color: 'var(--white)' }
  };
  const c = colors[type] || colors.success;

  const el = document.createElement('div');
  el.textContent = message;
  Object.assign(el.style, {
    position:     'fixed',
    bottom:       '24px',
    right:        '24px',
    background:   c.bg,
    color:        c.color,
    padding:      '12px 20px',
    borderRadius: '12px',
    fontSize:     '0.875rem',
    fontFamily:   'var(--font-body)',
    fontWeight:   '500',
    boxShadow:    '0 4px 16px rgba(0,0,0,0.18)',
    zIndex:       '9999',
    opacity:      '0',
    transform:    'translateY(8px)',
    transition:   'all 0.25s ease',
    maxWidth:     '320px'
  });

  document.body.appendChild(el);

  // Animate in
  requestAnimationFrame(() => {
    el.style.opacity   = '1';
    el.style.transform = 'translateY(0)';
  });

  // Animate out and remove
  setTimeout(() => {
    el.style.opacity   = '0';
    el.style.transform = 'translateY(8px)';
    setTimeout(() => el.remove(), 300);
  }, 2500);
};

/**
 * Построить прогресс-бар (возвращает HTML строку).
 * pct — число 0–100
 */
LH.progressBar = function(pct, height) {
  height = height || 6;
  return `
    <div class="progress" style="height:${height}px;">
      <div class="progress__fill" style="width:${pct}%;"></div>
    </div>`;
};

/**
 * Бейдж статуса темы (возвращает HTML строку).
 */
LH.statusBadge = function(status, lang) {
  lang = lang || 'sw';
  const map = {
    approved:    { cls: 'badge--approved',    sw: '✅ Imekubaliwa',  en: '✅ Approved' },
    review:      { cls: 'badge--review',      sw: '🔵 Ukaguzi',      en: '🔵 In review' },
    in_progress: { cls: 'badge--in-progress', sw: '🟡 Inaendelea',   en: '🟡 In progress' },
    pending:     { cls: 'badge--not-started', sw: '🔘 Bado',         en: '🔘 Pending' },
    revision:    { cls: 'badge--revision',    sw: '❌ Marekebisho',  en: '❌ Needs revision' }
  };
  const s = map[status] || map.pending;
  return `<span class="badge ${s.cls}" style="font-size:0.72rem;">${s[lang]}</span>`;
};

// ─────────────────────────────────────────────
// 6. URL HELPERS
// ─────────────────────────────────────────────

/**
 * Получить параметр из URL.
 * LH.getParam('id')  →  'kikurya'
 */
LH.getParam = function(key) {
  return new URLSearchParams(window.location.search).get(key);
};

// ─────────────────────────────────────────────
// 7. INIT
// ─────────────────────────────────────────────

window.LH = LH;

console.log('Lugha Hai — main.js loaded. Lang:', LH.lang);
