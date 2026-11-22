// ===== core.js: основа. Префиксы ключей (t_, s_, p_, g_, q_) и формат записей не меняйте: это ваши данные =====
const tg = window.Telegram.WebApp;
tg.ready();
tg.expand();
const user = tg.initDataUnsafe && tg.initDataUnsafe.user;
const hasCloud = !!(tg.CloudStorage && tg.isVersionAtLeast && tg.isVersionAtLeast("6.9"));

// ---------- Утилиты ----------
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function h(tag, cls, text, kids) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  (kids || []).forEach((k) => e.appendChild(k));
  return e;
}
const pad = (n) => String(n).padStart(2, "0");
const dateStr = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
const today = () => dateStr(new Date());
const toMin = (t) => { const p = t.split(":"); return parseInt(p[0], 10) * 60 + parseInt(p[1], 10); };
const fromMin = (m) => { m = ((m % 1440) + 1440) % 1440; return pad(Math.floor(m / 60)) + ":" + pad(m % 60); };
const fmtDur = (m) => Math.floor(m / 60) + " ч " + pad(Math.round(m % 60)) + " мин";
const fmtDate = (s) => { const p = s.split("-"); return p[2] + "." + p[1] + "." + p[0]; };
const fmtShort = (s) => { const p = s.split("-"); return p[2] + "." + p[1]; };
const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const MSHORT = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"];
function lastDays(n) {
  const out = [], now = new Date();
  for (let i = n - 1; i >= 0; i--) out.push(dateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)));
  return out;
}
function haptic(type) { if (tg.HapticFeedback) tg.HapticFeedback.impactOccurred(type || "light"); }
function confirmDel(cb) {
  if (tg.showConfirm) { try { tg.showConfirm("Удалить?", (ok) => { if (ok) cb(); }); return; } catch (e) {} }
  if (confirm("Удалить?")) cb();
}

// ---------- Хранилище ----------
const COLS = {
  tasks: ["t_", "tasks_v1"], sleeps: ["s_", "sleep_v1"], pushups: ["p_", "push_v1"],
  gym: ["g_", "gym_v1"], goals: ["q_", "goals_v1"],
};
const isArr = (c) => c === "tasks" || c === "goals";
const D = { tasks: [], sleeps: {}, pushups: {}, gym: {}, goals: [] };
const isEmpty = (v) => (Array.isArray(v) ? !v.length : !Object.keys(v).length);

function lsGet(k, def) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? def : v; } catch (e) { return def; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function saveLocal() { for (const c in COLS) lsSet(COLS[c][1], D[c]); }

function withTimeout(fn, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    fn((err, val) => { clearTimeout(t); if (err) reject(new Error(String(err))); else resolve(val); });
  });
}
const cloudGetKeys = () => withTimeout((cb) => tg.CloudStorage.getKeys(cb), 8000).then((k) => k || []);
function cloudGetItems(keys) {
  const chunks = [];
  for (let i = 0; i < keys.length; i += 50) chunks.push(keys.slice(i, i + 50));
  return Promise.all(chunks.map((ks) => withTimeout((cb) => tg.CloudStorage.getItems(ks, cb), 8000).then((v) => v || {})))
    .then((arr) => Object.assign({}, ...arr));
}
function cloudSet(key, obj) { if (hasCloud) tg.CloudStorage.setItem(key, JSON.stringify(obj)); }
function cloudRemove(keys) { if (hasCloud && keys.length) tg.CloudStorage.removeItems(keys); }
function put(c, obj) { saveLocal(); cloudSet(COLS[c][0] + (obj.id != null ? obj.id : obj.date), obj); }
function drop(c, key) { saveLocal(); cloudRemove([COLS[c][0] + key]); }

let syncOk = true;
async function loadAll() {
  const local = {};
  for (const c in COLS) local[c] = lsGet(COLS[c][1], isArr(c) ? [] : {});
  if (!hasCloud) { Object.assign(D, local); return; }
  try {
    const keys = await cloudGetKeys();
    const items = await cloudGetItems(keys.filter((k) => Object.values(COLS).some((v) => k.startsWith(v[0]))));
    const cloud = {};
    for (const c in COLS) cloud[c] = isArr(c) ? [] : {};
    Object.keys(items).forEach((k) => {
      try {
        const o = JSON.parse(items[k]);
        for (const c in COLS) if (k.startsWith(COLS[c][0])) { if (isArr(c)) cloud[c].push(o); else cloud[c][o.date] = o; }
      } catch (e) {}
    });
    for (const c in COLS) {
      if (isEmpty(cloud[c]) && !isEmpty(local[c])) {
        D[c] = local[c];
        (Array.isArray(local[c]) ? local[c] : Object.values(local[c])).forEach((o) => put(c, o));
      } else D[c] = cloud[c];
    }
    D.tasks.sort((a, b) => b.id - a.id);
    saveLocal();
    syncOk = true;
  } catch (e) {
    console.error(e);
    syncOk = false; // облако не ответило: остаются данные с устройства, в облаке ничего не перезаписывается
    Object.assign(D, local);
  }
}

// ---------- Реестр разделов (ошибка в одном разделе не ломает остальные) ----------
const App = {
  modules: {},
  register(name, render, onShow) { this.modules[name] = { render: render, onShow: onShow }; },
  render(name) { const m = this.modules[name]; if (!m) return; try { m.render(); } catch (e) { console.error(name, e); } },
  show(name) { const m = this.modules[name]; if (m && m.onShow) { try { m.onShow(); } catch (e) { console.error(name, e); } } },
  renderAll() { Object.keys(this.modules).forEach((n) => this.render(n)); },
};
const PAGE_MODULE = { pHome: "home", pTasks: "tasks", pSleep: "sleep", pWork: "work", pGoals: "goals" };

// ---------- Навигация ----------
function showPage(id) {
  document.querySelectorAll(".page").forEach((p) => p.classList.toggle("active", p.id === id));
  document.querySelectorAll(".nav button").forEach((b) => b.classList.toggle("active", b.dataset.page === id));
  App.render(PAGE_MODULE[id]);
  App.show(PAGE_MODULE[id]);
  window.scrollTo(0, 0);
}
document.querySelectorAll(".nav button").forEach((b) => b.addEventListener("click", () => { showPage(b.dataset.page); haptic(); }));
function setSeg(activeBtn, others) { activeBtn.className = ""; others.forEach((o) => (o.className = "secondary")); }

// ---------- Столбчатый график ----------
function niceStep(max) {
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  for (const s of steps) if (max / s <= 5) return s;
  return 1000;
}
function barChart(box, labels, vals, o) {
  o = o || {};
  const W = 340, H = 170, pl = 28, pb = 20, pt = 8, n = vals.length;
  const max = Math.max(o.goal || 0, ...vals, 1);
  const step = niceStep(max), top = Math.ceil(max / step) * step;
  const pw = W - pl - 4, ph = H - pb - pt, slot = pw / n, bw = Math.max(3, Math.min(26, slot * 0.65));
  const y = (v) => pt + ph - (v / top) * ph;
  const every = Math.ceil(n / 7);
  let s = '<svg class="chart" viewBox="0 0 ' + W + " " + H + '" xmlns="http://www.w3.org/2000/svg">';
  for (let v = 0; v <= top; v += step) {
    s += '<line class="grid" x1="' + pl + '" x2="' + (W - 4) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>' +
         '<text class="axis" x="0" y="' + (y(v) + 3) + '">' + v + "</text>";
  }
  if (o.goal) s += '<line class="goal" x1="' + pl + '" x2="' + (W - 4) + '" y1="' + y(o.goal) + '" y2="' + y(o.goal) + '"/>';
  vals.forEach((v, i) => {
    const x = pl + i * slot + (slot - bw) / 2;
    if (v > 0) s += '<rect class="bar' + (o.low && v < o.low ? " low" : "") + '" x="' + x + '" y="' + y(v) +
                    '" width="' + bw + '" height="' + (pt + ph - y(v)) + '" rx="2"/>';
    if ((n - 1 - i) % every === 0)
      s += '<text class="axis" text-anchor="middle" x="' + (x + bw / 2) + '" y="' + (H - 6) + '">' + labels[i] + "</text>";
  });
  s += "</svg>";
  if (o.note) s += '<p class="hint" style="margin:6px 0 0">' + o.note + "</p>";
  box.innerHTML = s;
}
