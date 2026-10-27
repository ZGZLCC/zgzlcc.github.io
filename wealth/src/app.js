import { DEFAULTS, IDENTITIES, SOLVABLES, personsOf } from "./core/calc.js";
import { formatWan } from "./core/format.js";
import { renderResult } from "./render.js";
import { loadState, saveState } from "./store.js";
import { startTheme } from "./theme.js";

const form = document.getElementById("form");
const result = document.getElementById("result");
const spendHint = document.getElementById("spend-hint");
// 计算方式的切换放在表单外面，单独拿一个引用，事件和勾选都要走它
const modeNav = document.querySelector(".mode-switch");

startTheme();

const state = restore(loadState());

/** 把本地存下的参数并进默认值：只认已知字段，类型不对就保留默认。 */
function restore(saved) {
  const next = { ...DEFAULTS, targets: [...DEFAULTS.targets] };
  for (const key of Object.keys(DEFAULTS)) {
    const value = saved[key];
    if (value === undefined || value === null) continue;
    if (Array.isArray(DEFAULTS[key])) {
      if (Array.isArray(value)) next[key] = value.filter((id) => SOLVABLES.some((item) => item.id === id));
    } else if (typeof DEFAULTS[key] === "number") {
      if (typeof value === "number" && Number.isFinite(value)) next[key] = value;
    } else if (typeof value === "string") {
      next[key] = value;
    }
  }
  if (!IDENTITIES.some((item) => item.id === next.identity)) next.identity = DEFAULTS.identity;
  if (next.mode !== "need" && next.mode !== "reverse") next.mode = DEFAULTS.mode;
  return next;
}

/** 空输入按「没填」算，交给 validate 解释；填了数字就按数字算。 */
function readNumber(input) {
  const raw = input.value.trim();
  return raw === "" ? Number.NaN : Number(raw);
}

function setRadio(root, name, value) {
  const radio = root.querySelector(`input[name="${name}"][value="${value}"]`);
  if (radio) radio.checked = true;
}

/**
 * 把 state 写回界面：输入框数值、单选项、反推时才出现的区块，
 * 以及「已被勾选反推」的那些项（置灰并禁用，避免误改一个正在被解的数字）。
 */
function syncForm() {
  for (const input of form.querySelectorAll("[data-field]")) {
    const value = state[input.dataset.field];
    input.value = Number.isFinite(value) ? String(value) : "";
  }
  setRadio(modeNav, "mode", state.mode);
  setRadio(form, "identity", state.identity);
  for (const box of form.querySelectorAll("input[data-target]")) {
    box.checked = state.targets.includes(box.value);
  }
  for (const section of form.querySelectorAll("[data-when]")) {
    section.hidden = section.dataset.when !== state.mode;
  }
  const solving = state.mode === "reverse" ? new Set(state.targets) : new Set();
  for (const group of form.querySelectorAll("[data-group]")) {
    const active = solving.has(group.dataset.group);
    group.classList.toggle("is-solving", active);
    for (const control of group.querySelectorAll("input, button")) control.disabled = active;
  }
}

function renderHint() {
  const solvingLiving = state.mode === "reverse" && state.targets.includes("living");
  if (solvingLiving) {
    spendHint.textContent = "生活开支交给反推，按目标年份解出人均月消费。";
    return;
  }
  const persons = personsOf(state.identity);
  const monthly = (Number.isFinite(state.monthlyPerPerson) ? state.monthlyPerPerson : 0) * persons;
  spendHint.textContent = `按 ${persons} 人计，家庭月消费 ${formatWan(monthly)} 万。`;
}

function update() {
  saveState(state);
  renderHint();
  result.innerHTML = renderResult(state);
}

function handleChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  if (target.dataset.field) {
    state[target.dataset.field] = readNumber(target);
    if (target.dataset.field === "children" && Number.isFinite(state.children)) {
      state.children = Math.max(0, Math.round(state.children));
    }
  } else if (target.name === "mode") {
    state.mode = target.value;
    syncForm();
  } else if (target.name === "identity") {
    state.identity = target.value;
  } else if (target.hasAttribute("data-target")) {
    state.targets = [...form.querySelectorAll("input[data-target]:checked")].map((box) => box.value);
    syncForm();
  } else {
    return;
  }
  update();
}

form.addEventListener("input", handleChange);
form.addEventListener("change", handleChange);
modeNav.addEventListener("change", handleChange);

document.getElementById("reset").addEventListener("click", () => {
  const { mode } = state;
  Object.assign(state, DEFAULTS, { targets: [...DEFAULTS.targets], mode });
  syncForm();
  update();
});

syncForm();
update();
