// ===== tasks.js: дела (сроки, приоритеты, повторы, подзадачи, категории, ручная сортировка) =====
const PRI_ICON = ["", "🟡 ", "🔴 "];
const REP_SHORT = { daily: "каждый день", weekdays: "по будням", weekly: "каждую неделю", monthly: "каждый месяц" };
const DEFAULT_CATS = ["Учёба", "Работа", "Дом", "Проект"];
const PRI_OPTIONS = '<option value="0">⚪ Обычный</option><option value="1">🟡 Важно</option><option value="2">🔴 Срочно</option>';
const REP_OPTIONS = '<option value="">Не повторять</option><option value="daily">Каждый день</option><option value="weekdays">По будням</option><option value="weekly">Каждую неделю</option><option value="monthly">Каждый месяц</option>';
const EMPTY = {
  today: "На сегодня задач нет 🎉", week: "На ближайшую неделю задач нет.",
  all: "Задач пока нет. Добавьте первую!", done: "Выполненных задач пока нет.",
};

let tView = lsGet("tasks_view", "today"), tCat = "", tManual = lsGet("tasks_manual", false), expandedId = null;

// ---------- Вспомогательные ----------
const ordOf = (t) => (t.ord != null ? t.ord : -t.id);
const prioOf = (t) => t.pri || 0;
const subsOf = (t) => t.subs || [];
const prioIcon = (t) => PRI_ICON[prioOf(t)];
const nowHM = () => { const n = new Date(); return pad(n.getHours()) + ":" + pad(n.getMinutes()); };

function addDays(ds, n) {
  const p = ds.split("-").map(Number);
  return dateStr(new Date(p[0], p[1] - 1, p[2] + n));
}
function nextDue(rep, ds) {
  const p = ds.split("-").map(Number);
  if (rep === "daily") return addDays(ds, 1);
  if (rep === "weekly") return addDays(ds, 7);
  if (rep === "monthly") {
    const dim = new Date(p[0], p[1] + 1, 0).getDate();
    return dateStr(new Date(p[0], p[1], Math.min(p[2], dim)));
  }
  let n = addDays(ds, 1); // по будням
  while ([0, 6].includes(new Date(n + "T00:00:00").getDay())) n = addDays(n, 1);
  return n;
}
function dueLabel(t) {
  if (!t.due) return "";
  const t0 = today();
  let s = t.due === t0 ? "сегодня" : t.due === addDays(t0, 1) ? "завтра" : t.due === addDays(t0, -1) ? "вчера" : fmtShort(t.due);
  if (t.time) s += " " + t.time;
  return s;
}
const isOverdue = (t) => !t.done && t.due && (t.due < today() || (t.due === today() && t.time && t.time < nowHM()));

function autoCmp(a, b) {
  const da = a.due || "9999-99-99", db = b.due || "9999-99-99";
  if (da !== db) return da < db ? -1 : 1;
  if (prioOf(a) !== prioOf(b)) return prioOf(b) - prioOf(a);
  return ordOf(a) - ordOf(b);
}
const tasksToday = () => D.tasks.filter((t) => !t.done && t.due && t.due <= today()).sort(autoCmp);

function visibleTasks() {
  const t0 = today(), wk = addDays(t0, 7);
  let list = D.tasks.filter((t) => (tView === "done" ? t.done : !t.done));
  if (tView === "today") list = list.filter((t) => t.due && t.due <= t0);
  if (tView === "week") list = list.filter((t) => t.due && t.due <= wk);
  if (tCat) list = list.filter((t) => (t.cat || "") === tCat);
  if (tView === "done") return list.sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  if (tManual) return list.sort((a, b) => ordOf(a) - ordOf(b) || a.id - b.id);
  return list.sort(autoCmp);
}

// ---------- Отмена удаления ----------
let toastT = null;
function toastUndo(msg, restore) {
  let el = $("toast");
  if (!el) { el = h("div", "toast"); el.id = "toast"; document.body.append(el); }
  el.innerHTML = "";
  el.append(h("span", null, msg));
  const b = h("button", null, "Отменить");
  b.onclick = () => { clearTimeout(toastT); el.classList.remove("show"); restore(); haptic(); };
  el.append(b);
  el.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove("show"), 6000);
}

// ---------- Действия ----------
function spawnNext(t) {
  let n = nextDue(t.rep, t.due || today()), guard = 0;
  while (n <= today() && guard++ < 400) n = nextDue(t.rep, n);
  const c = {
    id: Date.now() + Math.floor(Math.random() * 1000), text: t.text, done: false, due: n, time: t.time || "",
    pri: prioOf(t), cat: t.cat || "", rep: t.rep, subs: subsOf(t).map((s) => ({ t: s.t, d: false })), ord: ordOf(t) - 0.5,
  };
  D.tasks.push(c); put("tasks", c);
  t.spawned = c.id;
}
function toggleDone(t, checked) {
  t.done = checked;
  if (checked) {
    t.doneAt = Date.now();
    if (t.rep && !t.spawned) spawnNext(t);
  } else {
    delete t.doneAt;
    if (t.spawned) {
      const n = D.tasks.find((x) => x.id === t.spawned);
      if (n && !n.done) { D.tasks = D.tasks.filter((x) => x.id !== n.id); drop("tasks", n.id); }
      delete t.spawned;
    }
  }
  put("tasks", t); haptic(); renderTasks();
}
function removeTask(t) {
  D.tasks = D.tasks.filter((x) => x.id !== t.id);
  drop("tasks", t.id); haptic("medium"); renderTasks();
  toastUndo("Задача удалена", () => { D.tasks.push(t); put("tasks", t); renderTasks(); });
}
function moveTask(list, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  const a = list[i], b = list[j], oa = ordOf(a), ob = ordOf(b);
  if (oa === ob) { a.ord = dir < 0 ? ob - 0.5 : ob + 0.5; put("tasks", a); }
  else { a.ord = ob; b.ord = oa; put("tasks", a); put("tasks", b); }
  haptic(); renderTasks();
}

// ---------- Панель редактирования ----------
const field = (label, el) => { const d = h("div"); d.append(h("label", null, label), el); return d; };
const rowOf = (a, b) => { const r = h("div", "row"); r.style.marginBottom = "10px"; r.append(a, b); return r; };

function subAdder(t, redraw) {
  const inp = h("input"); inp.type = "text"; inp.placeholder = "Новая подзадача..."; inp.maxLength = 100;
  const b = h("button", null, "+");
  const go = () => {
    const v = inp.value.trim();
    if (!v) return;
    t.subs = subsOf(t);
    if (t.subs.length >= 20) return;
    t.subs.push({ t: v, d: false }); put("tasks", t); inp.value = ""; redraw();
  };
  b.onclick = go; inp.onkeydown = (e) => { if (e.key === "Enter") go(); };
  const r = h("div", "add"); r.append(inp, b);
  return r;
}

function editor(t) {
  const box = h("div", "edit");
  const inp = h("input"); inp.type = "text"; inp.value = t.text; inp.maxLength = 200;
  const due = h("input"); due.type = "date"; due.value = t.due || "";
  const time = h("input"); time.type = "time"; time.value = t.time || "";
  const pri = h("select"); pri.innerHTML = PRI_OPTIONS; pri.value = String(prioOf(t));
  const rep = h("select"); rep.innerHTML = REP_OPTIONS; rep.value = t.rep || "";
  const cat = h("input"); cat.type = "text"; cat.setAttribute("list", "catList"); cat.value = t.cat || ""; cat.maxLength = 30;

  const f1 = field("Название", inp); f1.style.marginBottom = "10px";
  const f2 = field("Категория", cat); f2.style.marginBottom = "10px";
  const subBox = h("div");
  function drawSubs() {
    subBox.innerHTML = "";
    subsOf(t).forEach((s, i) => {
      const r = h("div", "sub");
      const cb = h("input"); cb.type = "checkbox"; cb.checked = !!s.d;
      cb.onchange = () => { s.d = cb.checked; put("tasks", t); haptic(); };
      const x = h("button", "mini", "✕");
      x.onclick = () => { t.subs.splice(i, 1); put("tasks", t); drawSubs(); };
      r.append(cb, h("span", "t", s.t), x);
      subBox.append(r);
    });
  }
  drawSubs();

  const save = h("button", null, "Сохранить");
  save.onclick = () => {
    const v = inp.value.trim();
    if (!v) return;
    t.text = v; t.due = due.value || ""; t.time = time.value || ""; t.pri = parseInt(pri.value, 10);
    t.rep = rep.value; t.cat = cat.value.trim();
    if (t.rep && !t.due) t.due = today();
    if (!t.due) t.time = "";
    put("tasks", t); haptic(); expandedId = null; renderTasks();
  };
  const close = h("button", "secondary", "Свернуть");
  close.onclick = () => { expandedId = null; renderTasks(); };
  const bt = h("div", "row"); bt.style.marginTop = "12px"; bt.append(save, close);

  box.append(f1, rowOf(field("Срок", due), field("Время", time)), rowOf(field("Приоритет", pri), field("Повтор", rep)), f2,
    h("label", null, "Подзадачи"), subBox, subAdder(t, drawSubs), bt);
  return box;
}

// ---------- Строка задачи ----------
function taskRow(t, list, i) {
  const li = h("li", "item" + (t.done ? " done" : "") + (prioOf(t) ? " pri" + prioOf(t) : ""));
  const cb = h("input"); cb.type = "checkbox"; cb.checked = !!t.done;
  cb.onchange = () => toggleDone(t, cb.checked);

  const mid = h("div", "t");
  const title = h("div", null, prioIcon(t) + t.text); title.style.cursor = "pointer";
  title.onclick = () => { expandedId = expandedId === t.id ? null : t.id; renderTasks(); };
  mid.append(title);
  const parts = [];
  if (t.due) parts.push('<span class="' + (isOverdue(t) ? "over" : "") + '">📅 ' + dueLabel(t) + "</span>");
  if (t.rep) parts.push("🔁 " + REP_SHORT[t.rep]);
  if (t.cat) parts.push("#" + esc(t.cat));
  const subs = subsOf(t);
  if (subs.length) parts.push("☑ " + subs.filter((s) => s.d).length + "/" + subs.length);
  if (parts.length) { const m = h("div", "meta"); m.innerHTML = parts.join(" · "); mid.append(m); }
  li.append(cb, mid);

  if (tManual && tView !== "done") {
    const up = h("button", "mini", "↑"), dn = h("button", "mini", "↓");
    up.onclick = () => moveTask(list, i, -1);
    dn.onclick = () => moveTask(list, i, 1);
    li.append(up, dn);
  }
  const del = h("button", "del", "✕");
  del.onclick = () => removeTask(t);
  li.append(del);
  if (expandedId === t.id) li.append(editor(t));
  return li;
}

// ---------- Отрисовка ----------
function renderTasks() {
  const used = Array.from(new Set(D.tasks.map((t) => t.cat).filter(Boolean))).sort();
  if (tCat && !used.includes(tCat)) tCat = "";
  $("tCatFilter").innerHTML = '<option value="">Все категории</option>' + used.map((c) => '<option value="' + esc(c) + '">#' + esc(c) + "</option>").join("");
  $("tCatFilter").value = tCat;
  $("catList").innerHTML = Array.from(new Set(DEFAULT_CATS.concat(used))).map((c) => '<option value="' + esc(c) + '">').join("");
  $("tSort").textContent = tManual ? "↕ Вручную" : "⇅ Авто";
  document.querySelectorAll("#tViews button").forEach((b) => (b.className = b.dataset.view === tView ? "" : "secondary"));

  const list = visibleTasks().slice(0, 150);
  const ul = $("list"); ul.innerHTML = "";
  if (!list.length) ul.innerHTML = '<div class="empty">' + EMPTY[tView] + "</div>";
  list.forEach((t, i) => ul.appendChild(taskRow(t, list, i)));

  const left = D.tasks.filter((t) => !t.done), over = left.filter(isOverdue).length;
  $("counter").textContent = "Осталось всего: " + left.length + (over ? " · просрочено: " + over : "") + " · показано: " + list.length;
  $("clear").style.display = tView === "done" && list.length ? "block" : "none";
}

// ---------- Добавление и управление ----------
function addTask() {
  const v = $("input").value.trim();
  if (!v) return;
  const t = {
    id: Date.now(), text: v, done: false, ord: -Date.now(), pri: parseInt($("tPri").value, 10),
    due: $("tDue").value, time: $("tTime").value, rep: $("tRep").value, cat: $("tCat").value.trim(), subs: [],
  };
  if (!t.cat && tCat) t.cat = tCat;
  if (t.rep && !t.due) t.due = today();
  if (!t.due && (tView === "today" || tView === "week")) t.due = today();
  if (!t.due) t.time = "";
  if (tView === "done") tView = "all";
  D.tasks.unshift(t); put("tasks", t);
  $("input").value = ""; $("tDue").value = ""; $("tTime").value = ""; $("tPri").value = "0"; $("tRep").value = ""; $("tCat").value = "";
  haptic(); renderTasks();
}

$("tPri").innerHTML = PRI_OPTIONS;
$("tRep").innerHTML = REP_OPTIONS;
$("addBtn").onclick = addTask;
$("input").onkeydown = (e) => { if (e.key === "Enter") addTask(); };
$("tMore").onclick = () => {
  const o = $("tOpts"), show = o.style.display === "none";
  o.style.display = show ? "block" : "none";
  $("tMore").textContent = show ? "Параметры ▴" : "Параметры ▾";
};
document.querySelectorAll("#tViews button").forEach((b) => (b.onclick = () => {
  tView = b.dataset.view; lsSet("tasks_view", tView); expandedId = null; renderTasks();
}));
$("tCatFilter").onchange = () => { tCat = $("tCatFilter").value; renderTasks(); };
$("tSort").onclick = () => { tManual = !tManual; lsSet("tasks_manual", tManual); renderTasks(); };
$("clear").onclick = () => {
  const removed = visibleTasks();
  if (!removed.length) return;
  const ids = removed.map((t) => t.id);
  D.tasks = D.tasks.filter((t) => !ids.includes(t.id));
  ids.forEach((id) => drop("tasks", id)); haptic("medium"); renderTasks();
  toastUndo("Удалено задач: " + removed.length, () => { removed.forEach((t) => { D.tasks.push(t); put("tasks", t); }); renderTasks(); });
};

App.register("tasks", renderTasks);
