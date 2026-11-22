// ===== workouts.js: тренировки (отжимания и зал) =====
$("tabPush").onclick = () => { setSeg($("tabPush"), [$("tabGym")]); $("wPush").style.display = "block"; $("wGym").style.display = "none"; };
$("tabGym").onclick = () => { setSeg($("tabGym"), [$("tabPush")]); $("wPush").style.display = "none"; $("wGym").style.display = "block"; };

// ---------- таймер отдыха ----------
let restT = null;
const clock = (s) => Math.floor(s / 60) + ":" + pad(s % 60);
document.querySelectorAll("[data-rest]").forEach((b) => b.addEventListener("click", () => {
  clearInterval(restT);
  let left = parseInt(b.dataset.rest, 10);
  $("restOut").textContent = "Отдых: " + clock(left);
  haptic();
  restT = setInterval(() => {
    left--;
    if (left > 0) { $("restOut").textContent = "Отдых: " + clock(left); return; }
    clearInterval(restT);
    $("restOut").textContent = "Отдых окончен ✅";
    if (tg.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
  }, 1000);
}));

// ---------- отжимания ----------
const pushTotal = (d) => (D.pushups[d] ? D.pushups[d].sets.reduce((a, b) => a + b, 0) : 0);
function renderPush() {
  const t = today(), tot = pushTotal(t);
  const week = lastDays(7).reduce((a, d) => a + pushTotal(d), 0);
  const best = Math.max(0, ...Object.keys(D.pushups).map(pushTotal));
  const rev = lastDays(400).reverse();
  let i = pushTotal(rev[0]) ? 0 : 1, streak = 0;
  for (; i < rev.length && pushTotal(rev[i]); i++) streak++;
  $("pushStats").innerHTML = [["Сегодня", tot], ["Серия дней", streak], ["За 7 дней", week], ["Рекорд за день", best]]
    .map((x) => '<div class="card stat"><span class="hint">' + x[0] + "</span><b>" + x[1] + "</b></div>").join("");

  const box = $("pushToday"); box.innerHTML = "";
  const e = D.pushups[t];
  if (!e) box.append(h("span", "hint", "Сегодня подходов ещё нет."));
  else e.sets.forEach((n, idx) => {
    const c = h("span", "chip", n + " "), x = h("button", null, "✕");
    x.onclick = () => confirmDel(() => {
      e.sets.splice(idx, 1);
      if (e.sets.length) put("pushups", e); else { delete D.pushups[t]; drop("pushups", t); }
      renderPush();
    });
    c.append(x); box.append(c);
  });

  const days = lastDays(14);
  barChart($("pushChart"), days.map(fmtShort), days.map(pushTotal), { note: "Всего отжиманий за день." });

  const hist = $("pushHist"); hist.innerHTML = "";
  const ds = Object.keys(D.pushups).sort().reverse().slice(0, 10);
  if (!ds.length) hist.innerHTML = '<div class="empty">Записей пока нет.</div>';
  ds.forEach((d) => hist.append(h("li", "item", null, [h("span", "t", fmtDate(d) + " — " + pushTotal(d) + " (" + D.pushups[d].sets.join(" + ") + ")")])));
}
$("pushAdd").onclick = () => {
  const n = parseInt($("pushN").value, 10);
  if (!(n > 0 && n < 1000)) return;
  const t = today(), e = D.pushups[t] || { date: t, sets: [] };
  if (e.sets.length >= 100) return;
  e.sets.push(n); D.pushups[t] = e; put("pushups", e);
  $("pushN").value = ""; haptic(); renderPush();
};
$("pushN").onkeydown = (e) => { if (e.key === "Enter") $("pushAdd").click(); };

// ---------- зал ----------
function gymNames() {
  const s = new Set();
  Object.values(D.gym).forEach((e) => e.sets.forEach((x) => s.add(x.n)));
  return Array.from(s).sort();
}
function renderGym() {
  const names = gymNames();
  $("exList").innerHTML = names.map((n) => '<option value="' + esc(n) + '">').join("");
  const sel = $("gSel"), prev = sel.value;
  sel.innerHTML = names.length ? names.map((n) => "<option>" + esc(n) + "</option>").join("") : '<option value="">нет данных</option>';
  if (names.includes(prev)) sel.value = prev;
  renderGymChart();

  const box = $("gHist"); box.innerHTML = "";
  const ds = Object.keys(D.gym).sort().reverse().slice(0, 14);
  if (!ds.length) { box.innerHTML = '<div class="empty">Записей пока нет.</div>'; return; }
  ds.forEach((d) => {
    const e = D.gym[d], card = h("div", "card");
    card.append(h("b", null, fmtDate(d)));
    const groups = {};
    e.sets.forEach((s, i) => { (groups[s.n] = groups[s.n] || []).push([s, i]); });
    Object.keys(groups).forEach((n) => {
      const line = h("div"); line.style.marginTop = "8px";
      line.append(h("div", "hint", n));
      groups[n].forEach((p) => {
        const c = h("span", "chip", p[0].w + " × " + p[0].r + " "), x = h("button", null, "✕");
        x.onclick = () => confirmDel(() => {
          e.sets.splice(p[1], 1);
          if (e.sets.length) put("gym", e); else { delete D.gym[d]; drop("gym", d); }
          renderGym();
        });
        c.append(x); line.append(c);
      });
      card.append(line);
    });
    box.append(card);
  });
}
function renderGymChart() {
  const n = $("gSel").value;
  const pts = Object.keys(D.gym).sort().map((d) => {
    const w = D.gym[d].sets.filter((x) => x.n === n).map((x) => x.w);
    return w.length ? [d, Math.max(...w)] : null;
  }).filter(Boolean).slice(-12);
  if (!n || !pts.length) { $("gChart").innerHTML = '<p class="hint" style="margin:0">Добавьте подходы, и здесь появится график максимального веса.</p>'; return; }
  barChart($("gChart"), pts.map((p) => fmtShort(p[0])), pts.map((p) => p[1]), { note: "Максимальный вес в упражнении по дням, кг." });
}
$("gSel").onchange = renderGymChart;
$("gAdd").onclick = () => {
  const n = $("gName").value.trim(), w = parseFloat($("gW").value), r = parseInt($("gR").value, 10);
  if (!n || isNaN(w) || w < 0 || !(r > 0)) return;
  const t = today(), e = D.gym[t] || { date: t, sets: [] };
  if (e.sets.length >= 80) return;
  e.sets.push({ n: n, w: w, r: r }); D.gym[t] = e; put("gym", e);
  $("gR").value = ""; haptic(); renderGym();
};

App.register("work", () => { renderPush(); renderGym(); });
