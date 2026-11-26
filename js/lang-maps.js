// =============================================
// LUGHA HAI — карты страницы языка
// Пиксельные карты (assets/maps/*.png) + подписи, точки и линии поверх них.
// Подписи лежат в data/languages.json (поле "maps"), чтобы их мог править модератор.
// =============================================

const SIZES = { xl: 6.4, b: 5.4, t: 4.4 }   // размер шрифта в % ширины карты (cqw)
const pos = (lon, lat, e) => [ (lon - e[0]) / (e[1] - e[0]) * 100, (e[2] - lat) / (e[2] - e[3]) * 100 ]
const tr  = (v, lang) => (v && typeof v === 'object') ? (v[lang] || v.en || '') : (v || '')
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]))

function card(key, m, lang) {
  const sc = m.scale || 1
  let lines = '', dots = '', labels = ''
  for (const L of (m.labels || [])) {
    const [x, y] = pos(L.lon, L.lat, m.extent)
    if (L.to) {
      const [tx, ty] = pos(L.to[0], L.to[1], m.extent)
      lines += `<line x1="${x}" y1="${y}" x2="${tx}" y2="${ty}"/>`
      if (L.dot) dots += `<i class="lmap__dot" style="left:${tx}%;top:${ty}%"></i>`
    }
    const cls = 'lmap__label' + (L.caps ? ' is-caps' : '') + (L.water ? ' is-water' : '') + (L.left ? ' is-left' : '')
    labels += `<span class="${cls}" style="left:${x}%;top:${y}%;font-size:${(SIZES[L.size || 'b'] * sc).toFixed(2)}cqw">${esc(tr(L.text, lang))}</span>`
  }
  return `<div class="lmap__card lmap__card--${key}" data-key="${key}">
    <img src="${esc(m.img)}" alt="${esc(tr(m.alt, lang))}" draggable="false">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>${dots}${labels}
  </div>`
}

// Пунктирные линии от рамки на карте региона к крупному плану (только на широком экране)
function connect(root, cfg) {
  const old = root.querySelector('.lmap__conn'); if (old) old.remove()
  if (!window.matchMedia('(min-width: 901px)').matches) return
  const reg = root.querySelector('.lmap__card--region'), cl = root.querySelector('.lmap__card--close')
  if (!reg || !cl || !cfg.region.zoom) return
  const B = root.getBoundingClientRect(), R = reg.getBoundingClientRect(), C = cl.getBoundingClientRect()
  const e = cfg.region.extent, z = cfg.region.zoom
  const [fx0, fy0] = pos(z[0], z[2], e), [fx1, fy1] = pos(z[1], z[3], e)
  const px = (f, o, s) => o + f / 100 * s
  const x0 = px(fx0, R.left - B.left, R.width)
  const yT = px(fy0, R.top - B.top, R.height), yB = px(fy1, R.top - B.top, R.height)
  const cx = C.right - B.left
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('class', 'lmap__conn')
  svg.setAttribute('width', B.width); svg.setAttribute('height', B.height)
  svg.innerHTML = `<line x1="${x0}" y1="${yT}" x2="${cx}" y2="${C.top - B.top}"/><line x1="${x0}" y1="${yB}" x2="${cx}" y2="${C.bottom - B.top}"/>`
  root.appendChild(svg)
}

export function renderLangMaps(host, cfg, lang) {
  if (!host) return
  if (!cfg || !cfg.close) { host.innerHTML = ''; host.hidden = true; return }
  host.hidden = false
  const legend = (cfg.legend || []).map(it =>
    `<span class="lmap__lg"><i style="background:${esc(it.color)}"></i>${esc(tr(it.text, lang))}</span>`).join('')
  host.innerHTML = `<div class="lmap__board">${card('africa', cfg.africa, lang)}${card('region', cfg.region, lang)}${card('close', cfg.close, lang)}</div>` +
                   (legend ? `<div class="lmap__legend">${legend}</div>` : '')
  const board = host.querySelector('.lmap__board')
  const redo = () => connect(board, cfg)
  host.querySelectorAll('img').forEach(i => i.complete ? 0 : i.addEventListener('load', redo))
  redo()
  if (!host._lmapResize) { host._lmapResize = true; window.addEventListener('resize', () => { const b = host.querySelector('.lmap__board'); if (b && host._cfg) connect(b, host._cfg) }) }
  host._cfg = cfg
}
