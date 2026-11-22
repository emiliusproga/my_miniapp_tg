// ===== sleep.js: сон =====
$("sDate").value = today();
$("sSave").onclick = () => {
  const date = $("sDate").value, bed = $("sBed").value, wake = $("sWake").value, msg = $("sMsg");
  if (!date || !bed || !wake) { msg.textContent = "Заполните дату и оба времени."; return; }
  const dur = (toMin(wake) - toMin(bed) + 1440) % 1440;
  if (dur === 0) { msg.textContent = "Время отбоя и подъёма совпадает."; return; }
  const entry = { date: date, bed: bed, wake: wake, min: dur };
  D.sleeps[date] = entry; put("sleeps", entry);
  msg.textContent = "Сохранено: " + fmtDur(dur);
  haptic("medium"); renderSleep();
};

function avgFor(n) {
  const vals = lastDays(n).map((d) => D.sleeps[d]).filter(Boolean).map((s) => s.min);
  return vals.length ? { avg: vals.reduce((a, b) => a + b, 0) / vals.length, cnt: vals.length } : { avg: null, cnt: 0 };
}

let sleepRange = 7;
function renderSleepChart() {
  const days = lastDays(sleepRange);
  barChart($("chart"), days.map(fmtShort),
    days.map((d) => (D.sleeps[d] ? Math.round(D.sleeps[d].min / 6) / 10 : 0)),
    { goal: 8, low: 7, note: "Значения в часах. Пунктир: 8 часов, бледные столбцы: меньше 7 часов." });
}

// рекорды текущего месяца (обновляются сами: считаются по календарному месяцу)
function monthRecords(key) {
  const es = Object.values(D.sleeps).filter((s) => s.date.startsWith(key));
  if (!es.length) return null;
  const bedAdj = (s) => { const m = toMin(s.bed); return m < 720 ? m + 1440 : m; };
  const late = es.reduce((a, b) => (bedAdj(b) > bedAdj(a) ? b : a));
  const early = es.reduce((a, b) => (toMin(b.wake) < toMin(a.wake) ? b : a));
  return { late: late, early: early };
}
function renderRecords() {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const cur = monthRecords(today().slice(0, 7)), old = monthRecords(dateStr(prev).slice(0, 7));
  $("recTitle").textContent = "Рекорды: " + MONTHS[now.getMonth()].toLowerCase() + " " + now.getFullYear();
  $("recBed").textContent = cur ? cur.late.bed : "—";
  $("recBedD").textContent = cur ? "запись за " + fmtShort(cur.late.date) : "нет данных";
  $("recWake").textContent = cur ? cur.early.wake : "—";
  $("recWakeD").textContent = cur ? "запись за " + fmtShort(cur.early.date) : "нет данных";
  $("recPrev").textContent = old
    ? "Прошлый месяц (" + MONTHS[prev.getMonth()].toLowerCase() + "): самый поздний отбой " + old.late.bed + ", самый ранний подъём " + old.early.wake + "."
    : "";
}

function renderSleep() {
  renderRecords();
  const w = avgFor(7), m = avgFor(30);
  $("avgWeek").textContent = w.avg === null ? "—" : fmtDur(w.avg);
  $("cntWeek").textContent = w.cnt ? "ночей: " + w.cnt + " из 7" : "нет данных";
  $("avgMonth").textContent = m.avg === null ? "—" : fmtDur(m.avg);
  $("cntMonth").textContent = m.cnt ? "ночей: " + m.cnt + " из 30" : "нет данных";
  renderSleepChart();

  const ul = $("history"); ul.innerHTML = "";
  const entries = Object.values(D.sleeps).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 60);
  if (!entries.length) ul.innerHTML = '<div class="empty">Записей пока нет.</div>';
  entries.forEach((s) => {
    const info = h("div", "t");
    info.append(h("div", null, fmtDur(s.min)), h("div", "hint", fmtDate(s.date) + " · " + s.bed + " → " + s.wake));
    info.firstChild.style.fontWeight = "600";
    const del = h("button", "del", "✕");
    del.onclick = () => { delete D.sleeps[s.date]; drop("sleeps", s.date); haptic("medium"); renderSleep(); };
    ul.appendChild(h("li", "item", null, [info, del]));
  });

  const el = $("dynTip");
  if (w.avg === null) el.textContent = "Запишите несколько ночей, и здесь появится совет по вашим данным. Взрослым обычно нужно 7–9 часов сна.";
  else if (w.avg < 360) el.textContent = "В среднем за неделю вы спите " + fmtDur(w.avg) + ". Это заметно меньше нормы 7–9 часов. Попробуйте ложиться на 30–60 минут раньше.";
  else if (w.avg < 420) el.textContent = "В среднем за неделю вы спите " + fmtDur(w.avg) + ". Немного не хватает до 7–9 часов. Сдвиньте отбой на 15–30 минут раньше.";
  else if (w.avg <= 540) el.textContent = "Средний сон за неделю: " + fmtDur(w.avg) + ". Это в пределах нормы 7–9 часов, держите режим.";
  else el.textContent = "В среднем за неделю вы спите " + fmtDur(w.avg) + ". Это больше обычной нормы. Если при этом чувствуете усталость, обратите внимание на качество сна.";
}
$("r7").onclick = () => { sleepRange = 7; setSeg($("r7"), [$("r30")]); renderSleepChart(); };
$("r30").onclick = () => { sleepRange = 30; setSeg($("r30"), [$("r7")]); renderSleepChart(); };

// ---------- Умный подъём ----------
const CYCLE = 90, FALL_ASLEEP = 15, MAX_CYCLES = 6;
const cyclesWord = (n) => (n === 1 ? "цикл" : n >= 2 && n <= 4 ? "цикла" : "циклов");
function calcWake() {
  const bed = $("wBed").value, limit = $("wLimit").value, box = $("wResult");
  if (!bed || !limit) { box.innerHTML = '<p class="warn">Укажите оба времени.</p>'; return; }
  const b = toMin(bed), L = toMin(limit);
  lsSet("wake_cfg", { bed: bed, limit: limit });
  const windowMin = (L - b + 1440) % 1440;
  if (windowMin === 0) { box.innerHTML = '<p class="warn">Время отбоя и время подъёма совпадают. Укажите разные значения.</p>'; return; }
  const n = Math.min(Math.floor((windowMin - FALL_ASLEEP) / CYCLE), MAX_CYCLES);
  const bedFor5 = fromMin(L - FALL_ASLEEP - 5 * CYCLE);
  if (n < 1) {
    box.innerHTML = '<p class="warn"><b>Не хватает времени даже на один полный цикл сна.</b></p><p>Между отбоем и крайним временем подъёма только ' +
      fmtDur(windowMin) + '. Чтобы выспаться, лягте не позже <b>' + bedFor5 + "</b>.</p>";
    return;
  }
  const wakeAt = (c) => fromMin(b + FALL_ASLEEP + c * CYCLE);
  let html = '<div class="hint" style="text-align:center">Идеальное время подъёма</div><div class="result-big">' + wakeAt(n) +
    '</div><p style="text-align:center;margin:0 0 8px">' + n + " " + cyclesWord(n) + " · сон около " + fmtDur(n * CYCLE) + "</p>";
  if (wakeAt(n) !== limit) html += '<p class="hint" style="text-align:center;margin:0 0 8px">Это раньше вашего крайнего времени (' + limit + ") и не позже него.</p>";
  if (n < 5) html += '<p class="warn">Это меньше рекомендуемых 5–6 циклов (7,5–9 часов). Чтобы выспаться, лягте не позже <b>' + bedFor5 + "</b>.</p>";
  const alts = [];
  for (let c = n - 1; c >= Math.max(1, n - 2); c--) alts.push(c);
  if (alts.length) {
    html += '<div class="hint">Более ранние варианты:</div>';
    alts.forEach((c) => { html += '<span class="alt">' + wakeAt(c) + " · " + c + " " + cyclesWord(c) + "</span>"; });
  }
  box.innerHTML = html;
  if (!CONFIG.BOT_USERNAME.includes("ИМЯ")) {
    const best = wakeAt(n).replace(":", "");
    const btn = h("button", "secondary full", "⏰ Отправить это время боту");
    btn.style.marginTop = "12px";
    btn.onclick = () => tg.openTelegramLink("https://t.me/" + CONFIG.BOT_USERNAME + "?start=wake_" + best);
    box.appendChild(btn);
  }
  haptic("medium");
}
$("wCalc").onclick = calcWake;
const wakeCfg = lsGet("wake_cfg", null);
if (wakeCfg && wakeCfg.bed && wakeCfg.limit) { $("wBed").value = wakeCfg.bed; $("wLimit").value = wakeCfg.limit; }

App.register("sleep", renderSleep);
