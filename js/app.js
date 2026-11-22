// ===== app.js: запуск и синхронизация (подключается последним) =====
let syncing = false, firstSyncDone = false;

function setStatus() {
  $("status").textContent = !hasCloud ? "Данные хранятся только на этом устройстве"
    : syncing ? "⏳ Синхронизация…"
    : syncOk ? "☁️ Синхронизация между устройствами включена"
    : "⚠️ Нет связи с облаком Telegram, показаны данные с этого устройства";
}

async function sync(retries) {
  if (syncing) return;
  syncing = true; setStatus();
  await loadAll();
  syncing = false; setStatus();
  App.renderAll();
  if (!firstSyncDone) { firstSyncDone = true; goalsReady = true; } // с этого момента включаются окна поздравления
  if (!syncOk && retries > 0) setTimeout(() => sync(retries - 1), 3000);
}

function init() {
  // 1) мгновенно показываем то, что сохранено на устройстве
  for (const c in COLS) D[c] = lsGet(COLS[c][1], isArr(c) ? [] : {});
  D.tasks.sort((a, b) => b.id - a.id);
  setStatus();
  App.renderAll();
  App.show("home");
  // 2) затем подтягиваем свежие данные из облака
  sync(3);
  setInterval(() => { if ($("pHome").classList.contains("active")) App.render("home"); }, 30000);
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) { sync(1); App.show("home"); }
});

init();
