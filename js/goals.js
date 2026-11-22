// ===== goals.js: цели (год, месяцы, другие, прогресс, поздравление) =====
const SHORT_LOCK_NOTE = "🔒 Прошедший год: цели можно только смотреть.";
let goalYear = new Date().getFullYear(), goalView = "year";
const openMonths = new Set([new Date().getMonth() + 1]);

const yearGoals = (y) => D.goals.filter((g) => g.kind === "year" && g.year === y);
const monthGoals = (y, m) => D.goals.filter((g) => g.kind === "month" && g.year === y && g.month === m);
const children = (g) => D.goals.filter((c) => c.kind === "month" && c.parent === g.id);

function progress(g) {
  if (g.kind === "year") {
    const ch = children(g);
    if (ch.length) return Math.round(ch.reduce((a, c) => a + progress(c), 0) / ch.length);
  }
  return g.subs.length ? Math.round((g.subs.filter((s) => s.d).length / g.subs.length) * 100) : g.pct || 0;
}
const avgP = (arr) => (arr.length ? Math.round(arr.reduce((a, g) => a + progress(g), 0) / arr.length) : 0);

function daysLeft(dl) {
  const a = new Date(dl + "T00:00:00"), b = new Date(); b.setHours(0, 0, 0, 0);
  return Math.round((a - b) / 864e5);
}
function dlText(g) {
  if (!g.deadline) return "";
  const d = daysLeft(g.deadline);
  return d < 0 ? "просрочено на " + -d + " дн." : d === 0 ? "срок сегодня" : "осталось " + d + " дн.";
}
function sortedGoals() {
  return D.goals.slice().sort((a, b) => {
    const da = progress(a) >= 100, db = progress(b) >= 100;
    if (da !== db) return da ? 1 : -1;
    return (a.deadline || "9999") < (b.deadline || "9999") ? -1 : 1;
  });
}
function timePct(y) {
  const cy = new Date().getFullYear();
  if (y < cy) return 100;
  if (y > cy) return 0;
  const a = new Date(y, 0, 1), b = new Date(y + 1, 0, 1);
  return Math.round(((Date.now() - a) / (b - a)) * 100);
}

function barEl(p) {
  const bg = h("div", "bar-bg"), fg = h("div", "bar-fg");
  fg.style.width = Math.min(100, p) + "%"; bg.append(fg);
  return bg;
}
function quickAdd(ph, cb) {
  const inp = h("input"); inp.type = "text"; inp.placeholder = ph; inp.maxLength = 100;
  const b = h("button", null, "+");
  const go = () => { const v = inp.value.trim(); if (v) cb(v); };
  b.onclick = go; inp.onkeydown = (e) => { if (e.key === "Enter") go(); };
  const r = h("div", "add"); r.append(inp, b);
  return r;
}
function addGoal(kind, title, extra) {
  if ((kind === "year" || kind === "month") && extra.year < new Date().getFullYear()) return; // в прошлые годы цели не добавляются
  const g = Object.assign({ id: Date.now() + Math.floor(Math.random() * 1000), title: title, kind: kind, subs: [], pct: 0, deadline: "", parent: "" }, extra);
  D.goals.push(g); put("goals", g); haptic("medium"); renderGoals();
}

function goalCard(g, nested) {
  const p = progress(g), card = h("div", "card");
  if (nested) card.style.background = "var(--tg-theme-bg-color,#fff)";
  const head = h("div"); head.style.cssText = "display:flex;align-items:center;gap:8px";
  const del = h("button", "del", "✕");
  del.onclick = () => confirmDel(() => {
    if (g.kind === "year") children(g).forEach((c) => { c.parent = ""; put("goals", c); });
    D.goals = D.goals.filter((x) => x.id !== g.id); drop("goals", g.id); renderGoals();
  });
  head.append(h("b", "t", (p >= 100 ? "✅ " : "🎯 ") + g.title), del);
  card.append(head, h("div", "hint", p + "%" + (g.deadline ? " · " + dlText(g) + " (" + fmtDate(g.deadline) + ")" : "")), barEl(p));

  const ch = g.kind === "year" ? children(g) : [];
  if (ch.length) {
    ch.sort((a, b) => a.month - b.month).forEach((c) =>
      card.append(h("div", "hint", "• " + MSHORT[c.month - 1] + ": " + c.title + " — " + progress(c) + "%")));
    card.append(h("div", "hint", "Прогресс считается по привязанным месячным целям."));
  }

  if (g.kind === "month") {
    const ys = yearGoals(g.year);
    if (ys.length) {
      const sel = h("select"); sel.style.marginTop = "8px";
      sel.innerHTML = '<option value="">Без привязки к годовой цели</option>' +
        ys.map((y) => '<option value="' + y.id + '"' + (y.id === g.parent ? " selected" : "") + ">↑ " + esc(y.title) + "</option>").join("");
      sel.onchange = () => { g.parent = sel.value ? Number(sel.value) : ""; put("goals", g); renderGoals(); };
      card.append(sel);
    }
  }

  if (!ch.length) {
    g.subs.forEach((s, i) => {
      const li = h("li", "item" + (s.d ? " done" : "")); li.style.marginTop = "8px";
      li.style.background = nested ? "var(--tg-theme-secondary-bg-color,#f4f4f5)" : "var(--tg-theme-bg-color,#fff)";
      const cb = h("input"); cb.type = "checkbox"; cb.checked = s.d;
      cb.onchange = () => { s.d = cb.checked; put("goals", g); haptic(); renderGoals(); };
      const x = h("button", "del", "✕");
      x.onclick = () => { g.subs.splice(i, 1); put("goals", g); renderGoals(); };
      li.append(cb, h("span", "t", s.t), x);
      card.append(li);
    });
    if (!g.subs.length) {
      const r = h("input"); r.type = "range"; r.min = 0; r.max = 100; r.step = 5; r.value = g.pct || 0;
      r.onchange = () => { g.pct = parseInt(r.value, 10); put("goals", g); renderGoals(); };
      card.append(h("div", "hint", "Двигайте ползунок или добавьте шаги, и процент посчитается сам:"), r);
    }
    card.append(quickAdd("Новый шаг...", (v) => {
      if (g.subs.length >= 30) return;
      g.subs.push({ t: v, d: false }); put("goals", g); haptic(); renderGoals();
    }));
  }
  return card;
}

// --- вид «Год» ---
function viewYear(box) {
  const gs = yearGoals(goalYear);
  const sum = h("div", "card");
  sum.append(h("b", null, "Цели на " + goalYear + " год"),
    h("div", "hint", gs.length ? "Общий прогресс: " + avgP(gs) + "% · целей: " + gs.length
      : (goalYear < new Date().getFullYear() ? "За этот год цели не вносились." : "Добавьте первую годовую цель.")),
    barEl(avgP(gs)),
    quickAdd("Новая цель на год...", (v) => addGoal("year", v, { year: goalYear, deadline: goalYear + "-12-31" })));
  box.append(sum);
  gs.forEach((g) => box.append(goalCard(g)));
}

// --- вид «Месяцы» ---
function viewMonths(box) {
  for (let m = 1; m <= 12; m++) {
    const gs = monthGoals(goalYear, m);
    const d = h("details", "card");
    d.open = openMonths.has(m);
    d.addEventListener("toggle", () => { if (d.open) openMonths.add(m); else openMonths.delete(m); });
    const sm = h("summary", null, MONTHS[m - 1] + " · " + (gs.length ? avgP(gs) + "% (целей: " + gs.length + ")" : "нет целей"));
    sm.style.cssText = "cursor:pointer;font-weight:600";
    d.append(sm);
    if (gs.length) { const b = barEl(avgP(gs)); b.style.margin = "10px 0"; d.append(b); }
    gs.forEach((g) => d.append(goalCard(g, true)));
    d.append(quickAdd("Цель на " + MONTHS[m - 1].toLowerCase() + "...", (v) =>
      addGoal("month", v, { year: goalYear, month: m, deadline: dateStr(new Date(goalYear, m, 0)) })));
    box.append(d);
  }
}

// --- вид «Другие» ---
function viewOther(box) {
  const f = h("div", "card");
  const t = h("input"); t.type = "text"; t.placeholder = "Например, перевод в другую школу"; t.maxLength = 100;
  const lb = h("label", null, "Срок (необязательно)"); lb.style.marginTop = "8px";
  const dt = h("input"); dt.type = "date";
  const b = h("button", "full", "Добавить план"); b.style.marginTop = "10px";
  b.onclick = () => { const v = t.value.trim(); if (v) addGoal("other", v, { deadline: dt.value || "" }); };
  f.append(h("label", null, "Другие цели и планы"), t, lb, dt, b);
  box.append(f);
  sortedGoals().filter((g) => g.kind !== "year" && g.kind !== "month").forEach((g) => box.append(goalCard(g)));
}

// --- вид «Прогресс» ---
function viewProg(box) {
  const ys = yearGoals(goalYear), ms = D.goals.filter((g) => g.kind === "month" && g.year === goalYear);
  const base = ys.length ? ys : ms;
  const gp = avgP(base), tp = timePct(goalYear);
  const cy = new Date().getFullYear(), cm = new Date().getMonth() + 1;

  const c1 = h("div", "card");
  c1.append(h("b", null, "Год " + goalYear),
    h("div", "hint", "Выполнение целей: " + gp + "%"), barEl(gp),
    h("div", "hint", "Прошло времени года: " + tp + "%"), barEl(tp));
  if (base.length && goalYear === cy) {
    const diff = gp - tp;
    const msg = diff >= 5 ? "Вы опережаете график на " + diff + " п.п. 👍"
      : diff >= -5 ? "Вы идёте в графике."
      : "Вы отстаёте от графика на " + -diff + " п.п. Стоит поднажать.";
    c1.append(h("div", null, msg));
    c1.lastChild.style.marginTop = "8px";
  } else if (!base.length) {
    c1.append(h("div", "hint", goalYear < cy ? "За этот год цели не вносились."
      : "Добавьте цели на год или на месяцы, и здесь появится сравнение с графиком."));
  }
  box.append(c1);

  const all = ys.concat(ms);
  const monthAvg = [];
  for (let m = 1; m <= 12; m++) { const gs = monthGoals(goalYear, m); monthAvg.push(gs.length ? avgP(gs) : null); }
  const withData = monthAvg.map((v, i) => [v, i]).filter((x) => x[0] !== null);
  const best = withData.length ? withData.sort((a, b) => b[0] - a[0])[0] : null;
  const g2 = h("div", "grid2"); g2.style.marginBottom = "12px";
  g2.innerHTML = [
    ["Целей выполнено", all.filter((g) => progress(g) >= 100).length + " из " + all.length],
    ["Текущий месяц", goalYear === cy && monthAvg[cm - 1] !== null ? monthAvg[cm - 1] + "%" : "—"],
    ["Лучший месяц", best ? MSHORT[best[1]] + " " + best[0] + "%" : "—"],
    ["Годовых целей", ys.length],
  ].map((x) => '<div class="card stat"><span class="hint">' + x[0] + "</span><b>" + x[1] + "</b></div>").join("");
  box.append(g2);

  const c2 = h("div", "card");
  c2.append(h("b", null, "Прогресс по месяцам"));
  monthAvg.forEach((v, i) => {
    const r = h("div"); r.style.cssText = "display:flex;align-items:center;gap:8px;margin:8px 0";
    const l = h("span", null, MSHORT[i]); l.style.cssText = "width:36px;font-size:13px" + (goalYear === cy && i + 1 === cm ? ";font-weight:700" : "");
    const bar = barEl(v || 0); bar.style.cssText += ";flex:1;margin:0";
    const pc = h("span", "hint", v === null ? "—" : v + "%"); pc.style.cssText = "width:40px;text-align:right";
    r.append(l, bar, pc); c2.append(r);
  });
  box.append(c2);

  if (ys.length) {
    const c3 = h("div", "card");
    c3.append(h("b", null, "Годовые цели"));
    ys.forEach((g) => {
      const d = h("div", null, g.title + " — " + progress(g) + "%"); d.style.marginTop = "10px";
      c3.append(d, barEl(progress(g)));
    });
    box.append(c3);
  }
}

// ---------- Поздравление за годовую цель ----------
let goalsReady = false; // включается в app.js после первой синхронизации
const cgQueue = [];

function confetti(box) {
  const colors = ["#f4b400", "#db4437", "#0f9d58", "#4285f4", "#ab47bc", "#ff7043"];
  for (let i = 0; i < 40; i++) {
    const c = h("i", "confetti");
    c.style.cssText = "left:" + Math.random() * 100 + "%;background:" + colors[i % colors.length] +
      ";animation-delay:" + Math.random() * 1.5 + "s;animation-duration:" + (2 + Math.random() * 2) + "s";
    box.append(c);
  }
}
function showCongrats(g) {
  $("cgTitle").textContent = "Поздравляем, " + CONFIG.NAME + "!";
  $("cgText").textContent = "Годовая цель на " + g.year + " год выполнена на 100%.";
  $("cgGoal").textContent = "🎯 " + g.title;
  const box = $("confettiBox"); box.innerHTML = ""; confetti(box);
  $("congrats").classList.add("show");
  if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
}
function closeCongrats() {
  $("congrats").classList.remove("show");
  if (cgQueue.length) setTimeout(() => showCongrats(cgQueue.shift()), 300);
}
$("cgOk").onclick = closeCongrats;
$("congrats").onclick = (e) => { if (e.target === $("congrats")) closeCongrats(); };

function checkCelebrate() {
  const fresh = [];
  D.goals.filter((g) => g.kind === "year").forEach((g) => {
    const done = progress(g) >= 100;
    if (done && !g.celebrated) { g.celebrated = true; put("goals", g); fresh.push(g); }
    else if (!done && g.celebrated) { g.celebrated = false; put("goals", g); }
  });
  // пока goalsReady = false, уже выполненные цели помечаются молча, без окна
  if (goalsReady && fresh.length) {
    fresh.forEach((g) => cgQueue.push(g));
    if (!$("congrats").classList.contains("show")) showCongrats(cgQueue.shift());
  }
}

// ---------- Отрисовка ----------
function renderGoals() {
  const y = window.scrollY;
  $("gYear").textContent = goalYear;
  const box = $("goalBox"); box.innerHTML = "";
  ({ year: viewYear, months: viewMonths, other: viewOther, prog: viewProg })[goalView](box);
  if (goalYear < new Date().getFullYear() && (goalView === "year" || goalView === "months")) {
    box.querySelectorAll(".add, .del").forEach((e) => e.remove());
    box.querySelectorAll("input, select").forEach((e) => (e.disabled = true));
    const has = D.goals.some((g) => (g.kind === "year" || g.kind === "month") && g.year === goalYear);
    box.prepend(h("div", "card", SHORT_LOCK_NOTE + " " + (has ? "Добавлять и менять их нельзя." : "За этот год цели не вносились.")));
  }
  window.scrollTo(0, y);
  checkCelebrate();
}

const goalBtns = { year: $("gvYear"), months: $("gvMonths"), other: $("gvOther"), prog: $("gvProg") };
Object.keys(goalBtns).forEach((k) => {
  goalBtns[k].onclick = () => {
    goalView = k;
    setSeg(goalBtns[k], Object.values(goalBtns).filter((b) => b !== goalBtns[k]));
    renderGoals();
  };
});
$("gPrev").onclick = () => { goalYear--; renderGoals(); };
$("gNext").onclick = () => { goalYear++; renderGoals(); };

App.register("goals", renderGoals);
