// ===== home.js: главная и погода =====
const wx = {};
let wxAt = 0;
Object.assign(wx, lsGet("wx_cache", {}));

function wxInfo(c) {
  const t = [[0, "☀️", "ясно"], [2, "⛅", "переменная облачность"], [3, "☁️", "пасмурно"], [48, "🌫", "туман"], [57, "🌦", "морось"],
             [67, "🌧", "дождь"], [77, "❄️", "снег"], [82, "🌧", "ливни"], [86, "❄️", "снегопад"], [99, "⛈", "гроза"]];
  return t.find((x) => c <= x[0]) || t[0];
}
const ft = (c, f) => Math.round(c) + "°C" + (f ? " (" + Math.round((c * 9) / 5 + 32) + "°F)" : "");

async function loadWeather() {
  wxAt = Date.now();
  await Promise.all(CONFIG.PLACES.map(async (p) => {
    try {
      const r = await fetch("https://api.open-meteo.com/v1/forecast?latitude=" + p.lat + "&longitude=" + p.lon +
        "&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1");
      const j = await r.json();
      wx[p.n] = { t: j.current.temperature_2m, c: j.current.weather_code, mx: j.daily.temperature_2m_max[0], mn: j.daily.temperature_2m_min[0] };
    } catch (e) {}
  }));
  lsSet("wx_cache", wx);
  if ($("pHome").classList.contains("active")) renderHome();
}
const timeIn = (tz) => new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: tz });

function renderHome() {
  const sec = (fn) => { try { return fn(); } catch (e) { console.error(e); return ""; } };
  const now = new Date();
  const hr = parseInt(now.toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: CONFIG.LOCAL_TZ }), 10) % 24;
  const hello = hr < 5 ? "Доброй ночи" : hr < 12 ? "Доброе утро" : hr < 18 ? "Добрый день" : "Добрый вечер";
  const dateTxt = now.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" });
  let s = "<h1>" + hello + ", " + esc(CONFIG.NAME) + '!</h1><p class="hint" style="margin:0 0 14px">' + dateTxt + "</p>";

  s += sec(() => '<div class="grid2" style="margin-bottom:12px"><div class="card stat"><span class="hint">' + esc(CONFIG.LOCAL_LABEL) +
    "</span><b>" + timeIn(CONFIG.LOCAL_TZ) + '</b></div><div class="card stat"><span class="hint">' + esc(CONFIG.OTHER_LABEL) +
    "</span><b>" + timeIn(CONFIG.OTHER_TZ) + "</b></div></div>");

  s += sec(() => {
    let r = '<div class="card">';
    CONFIG.PLACES.forEach((p) => {
      const w = wx[p.n];
      if (!w) { r += "<div>" + esc(p.n) + ': <span class="hint">загрузка погоды…</span></div>'; return; }
      const i = wxInfo(w.c);
      r += '<div style="margin:4px 0">' + i[1] + " <b>" + esc(p.n) + "</b>: " + ft(w.t, p.f) + ", " + i[2] +
           '<div class="hint">днём от ' + ft(w.mn, p.f) + " до " + ft(w.mx, p.f) + "</div></div>";
    });
    return r + "</div>";
  });

    s += sec(() => {
    const left = D.tasks.filter((t) => !t.done), td = tasksToday();
    return '<div class="card link" data-go="pTasks"><b>✅ Дела</b><div>' +
      (D.tasks.length ? "На сегодня: " + td.length + " · всего осталось: " + left.length : "Задач пока нет") + "</div>" +
      td.slice(0, 3).map((t) => '<div class="hint">• ' + prioIcon(t) + esc(t.text) + "</div>").join("") + "</div>";
  });

  s += sec(() => {
    const lastS = Object.keys(D.sleeps).sort().pop(), w7 = avgFor(7);
    return '<div class="card link" data-go="pSleep"><b>😴 Сон</b><div>' +
      (lastS ? "Последняя запись: " + fmtDur(D.sleeps[lastS].min) + " (" + fmtShort(lastS) + ")" : "Записей пока нет") + "</div>" +
      (w7.avg !== null ? '<div class="hint">В среднем за неделю: ' + fmtDur(w7.avg) + "</div>" : "") + "</div>";
  });

  s += sec(() => {
    const gToday = D.gym[today()];
    return '<div class="card link" data-go="pWork"><b>💪 Тренировки сегодня</b><div>Отжимания: ' + pushTotal(today()) +
      "</div><div>Зал: " + (gToday ? gToday.sets.length + " подх." : "нет записей") + "</div></div>";
  });

  s += sec(() => {
    const act = sortedGoals().filter((g) => progress(g) < 100).slice(0, 3);
    let r = '<div class="card link" data-go="pGoals"><b>🎯 Цели</b>';
    if (!act.length) r += "<div>" + (D.goals.length ? "Все цели выполнены 🎉" : "Целей пока нет") + "</div>";
    act.forEach((g) => {
      r += '<div style="margin-top:8px">' + esc(g.title) + ' <span class="hint">' + progress(g) + "%" + (g.deadline ? " · " + dlText(g) : "") +
           '</span><div class="bar-bg"><div class="bar-fg" style="width:' + progress(g) + '%"></div></div></div>';
    });
    return r + "</div>";
  });

  $("homeBox").innerHTML = s;
  $("homeBox").querySelectorAll("[data-go]").forEach((el) => el.addEventListener("click", () => { showPage(el.dataset.go); haptic(); }));
}

App.register("home", renderHome, () => { if (Date.now() - wxAt > 600000) loadWeather(); });
