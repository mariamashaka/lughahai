/* Lugha Hai: здоровье (сердечки) и кошелёк игрока.
 *
 * Правила (решено Марией 28 ноября, см. claude/механики-игры-черновик.md):
 *  - три сердечка, делятся пополам (в коде: «половинки», всего 6);
 *  - за каждый пройденный игровой день здоровье снижается на половинку;
 *  - осталось два сердечка (4 половинки): предложение поесть, три половинки: напоминание;
 *    осталось одно сердечко (2 половинки): игра останавливается, пока герой не поест;
 *  - сытому еда здоровья не прибавляет, три сердечка это максимум;
 *  - болезни отнимают половинки, которые не растут от еды, пока герой не сходит в госпиталь;
 *  - экстренная работа всегда даёт 10 000 TZS и снижает здоровье на половинку, но не ниже одного сердечка;
 *  - до экранов объяснения значки скрыты (reveal() показывает их и оставляет насовсем).
 *
 * Страница подключает файл и вызывает LHHud.init(...). Состояние хранится в localStorage
 * (ключ lh_hud_<langId>); для Supabase передаётся свой store { load(), save(state) }.
 * Тексты интерфейса только суахили и английский (суахили проверить у носителей).
 */
(function (root) {
  'use strict'

  // ---------- ядро: состояние и правила (без DOM) ----------
  const HALF_MAX = 6          // три сердечка = шесть половинок
  const BLOCK_AT = 2          // одно сердечко и меньше: игра стоит
  const START_MONEY = 200000
  const EMERGENCY_PAY = 10000

  const fresh = () => ({ v: 1, shown: false, healthy: HALF_MAX, sick: 0, money: START_MONEY, days: [] })
  const cap = s => HALF_MAX - s.sick                      // выше этого еда не поднимает
  const isFull = s => s.healthy >= cap(s)

  // 'ok' | 'hungry' (объявление, 2 сердечка) | 'again' (напоминание, 1,5 сердечка) | 'blocked'
  function level(s) {
    if (s.healthy <= BLOCK_AT) return 'blocked'
    if (s.healthy === 4) return 'hungry'
    if (s.healthy === 3) return 'again'
    return 'ok'
  }
  // почему остановка: можно ли еда поднять выше порога
  function blockReason(s) { return cap(s) > BLOCK_AT ? 'eat' : 'hospital' }

  // какие картинки рисовать: три слота (позиции половинок: здоровые слева, больные справа)
  function slots(s) {
    const out = []
    for (let i = 0; i < 3; i++) {
      const key = [2 * i, 2 * i + 1].map(p => p < s.healthy ? 'h' : (p >= HALF_MAX - s.sick ? 's' : 'e')).join('')
      let icon = 'heart_empty', flip = false
      if (key === 'hh') icon = 'heart_full'
      else if (key === 'he' || key === 'hs') icon = 'heart_half'
      else if (key === 'ss') icon = 'heart_sick_full'
      else if (key === 'es') { icon = 'heart_sick_half'; flip = true }
      out.push({ icon, flip })
    }
    return out
  }

  const core = {
    HALF_MAX, BLOCK_AT, START_MONEY, EMERGENCY_PAY, fresh, cap, isFull, level, blockReason, slots,

    // пройден игровой день (все уроки дня); повторное прохождение того же дня здоровье не снижает
    dayDone(s, dayId) {
      if (dayId != null && s.days.includes(dayId)) return { changed: false }
      if (dayId != null) s.days.push(dayId)
      const before = s.healthy
      s.healthy = Math.max(0, s.healthy - 1)
      return { changed: s.healthy !== before }
    },
    // еда: half половинок (хлеб 1, угали с махарагве 2); больше трёх сердечек не бывает
    eat(s, half) {
      const room = cap(s) - s.healthy
      if (room <= 0) return { added: 0, reason: s.sick > 0 ? 'sick' : 'full' }
      const added = Math.min(Math.max(0, half | 0), room)
      s.healthy += added
      return { added, reason: 'ok' }
    },
    // болезнь: половинки уходят в «больные», пока не сходит в госпиталь
    hurt(s, half) {
      const n = Math.min(Math.max(0, half | 0), s.healthy)
      s.healthy -= n; s.sick += n
      return { lost: n }
    },
    hospital(s) { const n = s.sick; s.healthy += n; s.sick = 0; return { healed: n } },
    spend(s, n) { n = Math.max(0, Math.round(n)); if (n > s.money) return false; s.money -= n; return true },
    addMoney(s, n) { s.money += Math.max(0, Math.round(n)) },
    // экстренная работа: всегда доступна; здоровье падает на половинку, но не ниже одного сердечка
    emergencyWork(s) {
      s.money += EMERGENCY_PAY
      let cost = 0
      if (s.healthy > BLOCK_AT) { s.healthy -= 1; cost = 1 }
      return { pay: EMERGENCY_PAY, cost }
    },
  }
  root.LHHudCore = core
  if (typeof module !== 'undefined' && module.exports) module.exports = core
  if (typeof document === 'undefined') return

  // ---------- тексты (sw проверить у носителей) ----------
  const STR = {
    sw: {
      health: 'Afya', wallet: 'Pochi', close: 'Funga', tap: 'Bonyeza',
      ok: 'Afya yako ni nzuri.',
      full: 'Umeshiba. Chakula hakiongezi afya sasa.',
      fullSick: 'Chakula hakiwezi kuongeza afya zaidi. Unahitaji hospitali.',
      hungry: 'Una njaa. Ukila, afya yako itarudi.',
      blockedEat: 'Huwezi kuendelea hadi ule chakula.',
      blockedHospital: 'Wewe ni mgonjwa. Nenda hospitali.',
      findFood: 'Tafuta chakula',
      promptFirst: 'Una njaa. Twende tukale?',
      promptAgain: 'Bado una njaa. Twende tukale?',
      yes: 'Ndiyo, twende', later: 'Baadaye',
      money: (n) => 'Una TZS ' + n + '.',
      work: 'Kazi', emergency: 'Kazi ya dharura',
      emergencyM: 'Kupakua mizigo', emergencyF: 'Kufua nguo za hospitali',
      pay: (n) => '+' + n + ' TZS', cost: 'afya −½',
      gotPaid: (n) => 'Umepata TZS ' + n + '.',
    },
    en: {
      health: 'Health', wallet: 'Wallet', close: 'Close', tap: 'Tap',
      ok: 'Your health is good.',
      full: "You're full. Food won't add health right now.",
      fullSick: "Food can't add more health. You need the hospital.",
      hungry: "You're hungry. Eating will bring your health back.",
      blockedEat: "You can't continue until you eat.",
      blockedHospital: 'You are sick. Go to the hospital.',
      findFood: 'Find food',
      promptFirst: "You're hungry. Shall we go and eat?",
      promptAgain: "You're still hungry. Shall we go and eat?",
      yes: "Yes, let's go", later: 'Later',
      money: (n) => 'You have ' + n + ' TZS.',
      work: 'Work', emergency: 'Emergency work',
      emergencyM: 'Unload goods', emergencyF: 'Wash laundry for the hospital',
      pay: (n) => '+' + n + ' TZS', cost: 'health −½',
      gotPaid: (n) => 'You earned ' + n + ' TZS.',
    },
  }
  const fmt = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

  // ---------- состояние страницы ----------
  let opt = {}, S = fresh(), root_el = null, panel_el = null, lang = 'sw', gender = 'f'
  let heartsBtn, heartImgs = [], walletBtn, walletImg, moneyEl, hintEl, hintFor = null
  const T = () => STR[lang] || STR.sw

  const defaultStore = id => ({
    load() { try { return JSON.parse(localStorage.getItem('lh_hud_' + id) || 'null') } catch (e) { return null } },
    save(s) { try { localStorage.setItem('lh_hud_' + id, JSON.stringify(s)) } catch (e) {} },
  })
  const persist = () => { try { opt.store.save(S) } catch (e) {} }
  function changed(what) {
    persist(); render(what)
    try { root.dispatchEvent(new CustomEvent('lhhud:change', { detail: { state: snapshot(), what } })) } catch (e) {}
    if (typeof opt.onChange === 'function') { try { opt.onChange(snapshot(), what) } catch (e) {} }
  }
  const snapshot = () => ({
    shown: S.shown, healthy: S.healthy, sick: S.sick, money: S.money, level: level(S), blocked: level(S) === 'blocked',
    reason: level(S) === 'blocked' ? blockReason(S) : null, full: isFull(S), hearts: S.healthy / 2, days: S.days.slice(),
  })

  // ---------- вёрстка ----------
  const CSS = `
.lhhud{position:fixed;z-index:45;top:var(--hud-top,56px);left:var(--hud-left,12px);display:flex;gap:8px;align-items:center;font-family:inherit;--u:1.5px}
.lhhud[hidden]{display:none}
.lhhud.in{animation:lhhud-in .5s ease-out}
.lhhud>button{all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;background:rgba(24,34,29,.74);color:#fff;font-weight:700;font-size:.9rem;-webkit-tap-highlight-color:transparent}
.lhhud>button:focus-visible{outline:2px solid #FFD54A;outline-offset:2px}
.lhhud img{image-rendering:pixelated;display:block;-webkit-user-drag:none;user-select:none}
.lhhud .hearts img{width:calc(29*var(--u));height:calc(28*var(--u))}
.lhhud .hearts img.flip{transform:scaleX(-1)}
.lhhud .wallet img{width:calc(26*var(--u));height:calc(26*var(--u))}
.lhhud .hearts img.pop{animation:lhhud-pop .45s ease-out}
.lhhud .wallet.flash span{animation:lhhud-flash .6s ease-out}
.lhhud .wallet.empty{animation:lhhud-blink 1.6s ease-in-out infinite}
.lhhud .hint{position:absolute;top:calc(100% + 8px);padding:5px 10px;border-radius:10px;background:#FFD54A;color:#2a2a1c;font-weight:700;font-size:.8rem;white-space:nowrap;pointer-events:none;animation:lhhud-bob 1s ease-in-out infinite}
.lhhud .hint::before{content:'';position:absolute;top:-6px;left:14px;border:6px solid transparent;border-top:0;border-bottom-color:#FFD54A}
.lhhud .hint[hidden]{display:none}
.lhhud-panel{position:fixed;inset:0;z-index:60;display:flex;align-items:flex-end;justify-content:center;background:rgba(15,22,18,.5);font-family:inherit}
.lhhud-panel .card{box-sizing:border-box;width:min(440px,calc(100vw - 20px));margin:0 0 14px;padding:18px 18px 16px;border-radius:18px;background:#F7F3EC;color:#2C4A3E;box-shadow:0 8px 30px rgba(0,0,0,.35)}
.lhhud-panel h2{margin:0 0 8px;font-size:1.1rem}
.lhhud-panel p{margin:0 0 10px;line-height:1.4}
.lhhud-panel .vis{display:flex;gap:6px;margin:0 0 10px}
.lhhud-panel .vis img{image-rendering:pixelated;width:calc(29*var(--u,1.5px)*1.4);height:calc(28*var(--u,1.5px)*1.4)}
.lhhud-panel .vis img.flip{transform:scaleX(-1)}
.lhhud-panel .acts{display:flex;flex-direction:column;gap:8px;margin-top:6px}
.lhhud-panel button{all:unset;box-sizing:border-box;cursor:pointer;text-align:center;padding:10px 14px;border-radius:12px;background:#C4714A;color:#fff;font-weight:700;-webkit-tap-highlight-color:transparent}
.lhhud-panel button.ghost{background:transparent;color:#2C4A3E;border:2px solid #2C4A3E}
.lhhud-panel button small{display:block;font-weight:400;opacity:.9}
.lhhud-panel button:focus-visible{outline:2px solid #2C4A3E;outline-offset:2px}
@keyframes lhhud-in{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:none}}
@keyframes lhhud-pop{40%{transform:scale(1.25)}}
@keyframes lhhud-flash{30%{color:#FFD54A;transform:scale(1.15)}}
@keyframes lhhud-blink{50%{opacity:.55}}
@keyframes lhhud-bob{50%{transform:translateY(4px)}}
@media (prefers-reduced-motion:reduce){.lhhud *,.lhhud{animation:none!important}}
`
  function setScale() {
    // целое число физических пикселей на пиксель рисунка (≈1,4 css-пикселя), чтобы пиксель-арт не плыл
    const dpr = root.devicePixelRatio || 1
    const n = Math.max(2, Math.round(dpr * 1.4))
    const css = n / dpr
    document.documentElement.style.setProperty('--u', css + 'px')
    if (root_el) root_el.style.setProperty('--u', css + 'px')
  }
  const img = (src, cls) => { const i = document.createElement('img'); i.alt = ''; i.draggable = false; i.src = opt.assetBase + src + '.png'; if (cls) i.className = cls; return i }
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e }

  function build() {
    if (root_el) return
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st)
    root_el = el('div', 'lhhud'); root_el.hidden = true
    heartsBtn = el('button', 'hearts'); heartsBtn.type = 'button'
    for (let i = 0; i < 3; i++) { const im = img('heart_full'); heartImgs.push(im); heartsBtn.appendChild(im) }
    heartsBtn.onclick = openHealth
    walletBtn = el('button', 'wallet'); walletBtn.type = 'button'
    walletImg = img('wallet'); moneyEl = el('span'); walletBtn.append(walletImg, moneyEl)
    walletBtn.onclick = openWallet
    hintEl = el('div', 'hint'); hintEl.hidden = true
    root_el.append(heartsBtn, walletBtn, hintEl)
    ;(opt.mount || document.body).appendChild(root_el)
    setScale(); root.addEventListener('resize', setScale)
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && panel_el && panel_el.dataset.modal !== '1') closePanel() })
  }

  function render(what) {
    if (!root_el) return
    heartsBtn.setAttribute('aria-label', T().health + ': ' + (S.healthy / 2))
    walletBtn.setAttribute('aria-label', T().wallet + ': ' + fmt(S.money))
    const sl = slots(S)
    sl.forEach((s, i) => {
      const im = heartImgs[i], next = opt.assetBase + s.icon + '.png'
      const was = im.getAttribute('src')
      if (was !== next) { im.src = next; if (what && what !== 'init') { im.classList.remove('pop'); void im.offsetWidth; im.classList.add('pop') } }
      im.classList.toggle('flip', s.flip)
    })
    moneyEl.textContent = fmt(S.money)
    walletImg.src = opt.assetBase + (S.money <= 0 ? 'wallet_empty' : 'wallet') + '.png'
    walletBtn.classList.toggle('empty', S.money <= 0)
    if (what === 'money') { walletBtn.classList.remove('flash'); void walletBtn.offsetWidth; walletBtn.classList.add('flash') }
    root_el.hidden = !S.shown
    if (hintFor) placeHint()
  }
  function placeHint() {
    const target = hintFor === 'wallet' ? walletBtn : heartsBtn
    hintEl.style.left = (target.offsetLeft) + 'px'
  }

  // ---------- окна ----------
  function closePanel() { if (panel_el) { panel_el.remove(); panel_el = null } }
  function openPanel(modal) {
    closePanel()
    panel_el = el('div', 'lhhud-panel'); panel_el.dataset.modal = modal ? '1' : '0'
    panel_el.setAttribute('role', 'dialog'); panel_el.setAttribute('aria-modal', 'true')
    panel_el.style.setProperty('--u', getComputedStyle(root_el).getPropertyValue('--u') || '1.5px')
    const card = el('div', 'card'); panel_el.appendChild(card)
    if (!modal) panel_el.addEventListener('click', e => { if (e.target === panel_el) closePanel() })
    document.body.appendChild(panel_el)
    return card
  }
  const visHearts = () => { const v = el('div', 'vis'); slots(S).forEach(s => v.appendChild(img(s.icon, s.flip ? 'flip' : ''))); return v }
  const btn = (txt, fn, ghost, sub) => { const b = el('button', ghost ? 'ghost' : '', txt); b.type = 'button'; if (sub) b.appendChild(el('small', '', sub)); b.onclick = fn; return b }

  function healthText() {
    const lv = level(S), t = T()
    if (lv === 'blocked') return blockReason(S) === 'hospital' ? t.blockedHospital : t.blockedEat
    if (isFull(S)) return S.sick > 0 ? t.fullSick : t.full
    if (lv === 'hungry' || lv === 'again') return t.hungry
    return t.ok
  }
  function findFood() { closePanel(); if (typeof opt.onFindFood === 'function') opt.onFindFood() }

  function openHealth() {
    if (hintFor === 'hearts') hint(null)
    const t = T(), card = openPanel(false)
    card.append(el('h2', '', t.health), visHearts(), el('p', '', healthText()))
    const acts = el('div', 'acts')
    acts.append(btn(t.findFood, findFood), btn(t.close, closePanel, true))
    card.appendChild(acts)
  }
  function openWallet() {
    if (hintFor === 'wallet') hint(null)
    const t = T(), card = openPanel(false)
    card.append(el('h2', '', t.wallet), el('p', '', t.money(fmt(S.money))))
    const acts = el('div', 'acts')
    if (typeof opt.onWork === 'function') acts.append(btn(t.work, () => { closePanel(); opt.onWork() }))
    acts.append(emergencyButton(), btn(t.close, closePanel, true))
    card.appendChild(acts)
  }
  function emergencyButton() {
    const t = T(), what = gender === 'm' ? t.emergencyM : t.emergencyF
    const sub = what + ' · ' + t.pay(fmt(EMERGENCY_PAY)) + ' · ' + t.cost
    return btn(t.emergency, () => {
      closePanel()
      if (typeof opt.onEmergencyWork === 'function') opt.onEmergencyWork(() => api.emergencyWork())   // сцена, потом применить
      else api.emergencyWork()
    }, false, sub)
  }
  // предложение поесть (2 сердечка) и напоминание (1,5); соглашаться необязательно
  function showPrompt() {
    const lv = level(S); if (lv !== 'hungry' && lv !== 'again') return false
    const t = T(), card = openPanel(false)
    card.append(el('h2', '', t.health), visHearts(), el('p', '', lv === 'hungry' ? t.promptFirst : t.promptAgain))
    const acts = el('div', 'acts'); acts.append(btn(t.yes, findFood), btn(t.later, closePanel, true)); card.appendChild(acts)
    return true
  }
  // остановка: закрыть нельзя, пока не поел (или не заработал, или не сходил в госпиталь)
  function showBlocked() {
    if (level(S) !== 'blocked') return false
    const t = T(), card = openPanel(true), hospital = blockReason(S) === 'hospital'
    card.append(el('h2', '', t.health), visHearts(), el('p', '', hospital ? t.blockedHospital : t.blockedEat))
    const acts = el('div', 'acts')
    if (!hospital) acts.append(btn(t.findFood, findFood))
    acts.append(emergencyButton())
    card.appendChild(acts)
    return true
  }
  function hint(which, text) {
    hintFor = which
    if (!which) { hintEl.hidden = true; return }
    hintEl.textContent = text || T().tap; hintEl.hidden = false; placeHint()
  }

  // ---------- публичный интерфейс ----------
  const api = {
    core,
    init(o) {
      opt = Object.assign({ langId: 'kikurya', lang: 'sw', gender: 'f', assetBase: 'assets/ui/' }, o || {})
      if (!opt.store) opt.store = defaultStore(opt.langId)
      lang = opt.lang; gender = opt.gender
      const saved = opt.store.load()
      S = saved && saved.v === 1 ? Object.assign(fresh(), saved) : fresh()
      build(); render('init')
      return api
    },
    setLang(l) { lang = l === 'en' ? 'en' : 'sw'; render('init'); if (hintFor) hint(hintFor) },
    setGender(g) { gender = g === 'm' ? 'm' : 'f' },
    state: snapshot,
    // показать значки (после экранов объяснения); дальше они на экране постоянно
    reveal() { if (S.shown) return; S.shown = true; changed('init'); root_el.classList.remove('in'); void root_el.offsetWidth; root_el.classList.add('in') },
    isShown: () => S.shown,
    // пройден игровой день (все уроки): здоровье −½; возвращает состояние для решения, что показать
    dayDone(dayId) {
      const r = core.dayDone(S, dayId)
      if (r.changed) changed('health')
      return Object.assign({ level: level(S) }, r)
    },
    // еда: 1 половинка (хлеб), 2 (угали с махарагве)
    eat(half) { const r = core.eat(S, half); if (r.added) changed('health'); return r },
    hurt(half) { const r = core.hurt(S, half); if (r.lost) changed('health'); return r },
    hospital() { const r = core.hospital(S); if (r.healed) changed('health'); return r },
    spend(n) { const ok = core.spend(S, n); if (ok) changed('money'); return ok },
    addMoney(n) { core.addMoney(S, n); changed('money') },
    emergencyWork() { const r = core.emergencyWork(S); changed('money'); return r },
    isBlocked: () => level(S) === 'blocked',
    showPrompt, showBlocked, closePanel, hint,
    // сбросить игру этого языка (для теста)
    reset() { S = fresh(); changed('init') },
  }
  root.LHHud = api
})(typeof window !== 'undefined' ? window : globalThis)
 
