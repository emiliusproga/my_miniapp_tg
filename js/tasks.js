// ===== tasks.js: дела =====
function renderTasks() {
  const list = $("list"); list.innerHTML = "";
  if (!D.tasks.length) list.innerHTML = '<div class="empty">Задач пока нет. Добавьте первую!</div>';
  D.tasks.forEach((task) => {
    const li = h("li", "item" + (task.done ? " done" : ""));
    const cb = h("input"); cb.type = "checkbox"; cb.checked = task.done;
    cb.onchange = () => { task.done = cb.checked; put("tasks", task); haptic(); renderTasks(); };
    const del = h("button", "del", "✕");
    del.onclick = () => { D.tasks = D.tasks.filter((t) => t.id !== task.id); drop("tasks", task.id); haptic("medium"); renderTasks(); };
    li.append(cb, h("span", "t", task.text), del);
    list.appendChild(li);
  });
  $("counter").textContent = "Осталось: " + D.tasks.filter((t) => !t.done).length + " из " + D.tasks.length;
  $("clear").style.display = D.tasks.some((t) => t.done) ? "block" : "none";
}
function addTask() {
  const v = $("input").value.trim();
  if (!v) return;
  const task = { id: Date.now(), text: v, done: false };
  D.tasks.unshift(task); $("input").value = "";
  put("tasks", task); haptic(); renderTasks();
}
$("addBtn").onclick = addTask;
$("input").onkeydown = (e) => { if (e.key === "Enter") addTask(); };
$("clear").onclick = () => {
  const ids = D.tasks.filter((t) => t.done).map((t) => t.id);
  D.tasks = D.tasks.filter((t) => !t.done);
  ids.forEach((id) => drop("tasks", id)); haptic("medium"); renderTasks();
};

App.register("tasks", renderTasks);
