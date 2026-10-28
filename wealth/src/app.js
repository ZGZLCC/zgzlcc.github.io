import { DEFAULT_CHILD_YEAR, DEFAULTS, IDENTITIES, personsOf } from "./core/calc.js";
import { formatWan } from "./core/format.js";
import { renderRunway, renderSalary } from "./render.js";
import { loadState, saveState } from "./store.js";
import { startTheme } from "./theme.js";

const form = document.getElementById("form");
const spendHint = document.getElementById("spend-hint");
const childYears = document.getElementById("child-years");
const salaryPanel = document.getElementById("salary-panel");
const salaryResult = document.getElementById("salary-result");
const runwayResult = document.getElementById("runway-result");

startTheme();

const state = restore(loadState());

/** 把本地存下的参数并进默认值：只认已知字段，类型不对就保留默认。 */
function restore(saved) {
  const next = { ...DEFAULTS, childStartYears: [...DEFAULTS.childStartYears] };
  for (const key of Object.keys(DEFAULTS)) {
    const value = saved[key];
    if (value === undefined || value === null) continue;
    if (key === "childStartYears") {
      if (Array.isArray(value)) {
        next[key] = value.filter((year) => typeof year === "number" && Number.isFinite(year));
      }
    } else if (typeof DEFAULTS[key] === "number") {
      if (typeof value === "number" && Number.isFinite(value)) next[key] = value;
    } else if (typeof value === "string") {
      next[key] = value;
    }
  }
  if (!IDENTITIES.some((item) => item.id === next.identity)) next.identity = DEFAULTS.identity;
  return next;
}

/** 空输入按「没填」算，交给计算层按 0 / 默认值处理；填了数字就按数字算。 */
function readNumber(input) {
  const raw = input.value.trim();
  return raw === "" ? Number.NaN : Number(raw);
}

function setRadio(root, name, value) {
  const radio = root.querySelector(`input[name="${name}"][value="${value}"]`);
  if (radio) radio.checked = true;
}

/** 孩子数量变了就增减开始年份，让数组长度跟孩子数一致；输入框空着的时候不动。 */
function resizeChildYears() {
  const raw = Number(state.children);
  if (!Number.isFinite(raw) || raw < 0) return;
  const count = Math.round(raw);
  const years = state.childStartYears.slice(0, count);
  while (years.length < count) years.push(DEFAULT_CHILD_YEAR);
  state.childStartYears = years;
}

/** 每个孩子一行「开始年份」，块跟着孩子数量动态生成。 */
function syncChildYears() {
  childYears.innerHTML = state.childStartYears
    .map((year, index) => `<label class="field">
      <span class="field-label">第 ${index + 1} 个孩子开始年份<em>工作第几年</em></span>
      <input type="number" data-child-year="${index}" min="1" step="1" inputmode="numeric" value="${Number.isFinite(year) ? year : ""}" />
    </label>`)
    .join("");
}

/** 把 state 写回表单：数值与单选项。 */
function syncForm() {
  for (const input of form.querySelectorAll("[data-field]")) {
    const value = state[input.dataset.field];
    input.value = Number.isFinite(value) ? String(value) : "";
  }
  setRadio(form, "identity", state.identity);
  resizeChildYears();
  syncChildYears();
}

/** 「工资计算」板块的六个输入框，跟主表单共用同一份 state。 */
function syncSalary() {
  for (const input of salaryPanel.querySelectorAll("[data-salary]")) {
    const value = state[input.dataset.salary];
    input.value = Number.isFinite(value) ? String(value) : "";
  }
}

function renderHint() {
  const persons = personsOf(state.identity);
  const monthly = (Number.isFinite(state.monthlyPerPerson) ? state.monthlyPerPerson : 0) * persons;
  spendHint.textContent = `按 ${persons} 人计，家庭月消费 ${formatWan(monthly)} 万；不含房贷与育儿，这两项单独扣。`;
}

function update() {
  saveState(state);
  renderHint();
  salaryResult.innerHTML = renderSalary(state);
  runwayResult.innerHTML = renderRunway(state);
}

function handleChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  // 每个孩子那一行的开始年份，按下标写回数组
  if (target.dataset.childYear !== undefined) {
    state.childStartYears[Number(target.dataset.childYear)] = readNumber(target);
    update();
    return;
  }
  const field = target.dataset.field ?? target.dataset.salary;
  if (field) {
    state[field] = readNumber(target);
    if (field === "children") {
      if (Number.isFinite(state.children)) state.children = Math.max(0, Math.round(state.children));
      resizeChildYears();
      syncChildYears();
    }
  } else if (target.name === "identity") {
    state.identity = target.value;
  } else {
    return;
  }
  update();
}

form.addEventListener("input", handleChange);
form.addEventListener("change", handleChange);
salaryPanel.addEventListener("input", handleChange);
salaryPanel.addEventListener("change", handleChange);

document.getElementById("reset").addEventListener("click", () => {
  Object.assign(state, DEFAULTS, { childStartYears: [...DEFAULTS.childStartYears] });
  syncForm();
  syncSalary();
  update();
});

syncForm();
syncSalary();
update();
