import {
  BLOCK_DEFAULTS,
  DEFAULT_CHILD_YEAR,
  DEFAULT_CUSTOM,
  DEFAULTS,
  FIXED_BLOCKS,
  IDENTITIES,
  personsOf,
} from "./core/calc.js";
import { formatWan } from "./core/format.js";
import { renderRunway, renderSalary } from "./render.js";
import { loadState, saveState } from "./store.js";
import { startTheme } from "./theme.js";

const form = document.getElementById("form");
const spendHint = document.getElementById("spend-hint");
const childYears = document.getElementById("child-years");
const customList = document.getElementById("custom-list");
const restoreSlot = document.getElementById("restore-slot");
const salaryPanel = document.getElementById("salary-panel");
const salaryResult = document.getElementById("salary-result");
const runwayResult = document.getElementById("runway-result");

startTheme();

const state = restore(loadState());

/** 把本地存下的参数并进默认值：只认已知字段，类型不对就保留默认。 */
function restore(saved) {
  const next = {
    ...DEFAULTS,
    childStartYears: [...DEFAULTS.childStartYears],
    removed: [],
    custom: [],
  };
  for (const key of Object.keys(DEFAULTS)) {
    const value = saved[key];
    if (value === undefined || value === null) continue;
    if (key === "childStartYears" || key === "removed" || key === "custom") continue;
    if (typeof DEFAULTS[key] === "number") {
      if (typeof value === "number" && Number.isFinite(value)) next[key] = value;
    } else if (typeof DEFAULTS[key] === "string") {
      next[key] = value;
    }
  }
  if (Array.isArray(saved.childStartYears)) {
    next.childStartYears = saved.childStartYears.filter((year) => typeof year === "number" && Number.isFinite(year));
  }
  const blockIds = FIXED_BLOCKS.map((block) => block.id);
  if (Array.isArray(saved.removed)) {
    next.removed = saved.removed.filter((id) => blockIds.includes(id));
  }
  if (Array.isArray(saved.custom)) {
    next.custom = saved.custom.filter((item) => item && typeof item === "object").map(normalizeCustom);
  }
  if (!IDENTITIES.some((item) => item.id === next.identity)) next.identity = DEFAULTS.identity;
  return next;
}

/** 存下来的自定义专项：数字字段必须是有限数，其他一律回落到默认。 */
function normalizeCustom(item, index) {
  const pick = (key) => (typeof item[key] === "number" && Number.isFinite(item[key]) ? item[key] : DEFAULT_CUSTOM[key]);
  return {
    id: typeof item.id === "string" && item.id ? item.id : `c-restored-${index}`,
    name: typeof item.name === "string" ? item.name : "",
    amount: pick("amount"),
    year: pick("year"),
    monthly: pick("monthly"),
    monthlyYear: pick("monthlyYear"),
    years: pick("years"),
  };
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

/** 属性值转义，名字里带引号也不会破坏标签。 */
function escapeAttr(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** 数值框里没有数就留空，不写 NaN。 */
function valueText(value) {
  return Number.isFinite(value) ? String(value) : "";
}

/** 一个自定义专项：和房子同款（一次性金额 + 年份、每月金额 + 起始年 + 年数），外加名字。 */
function customMarkup(item, index) {
  const id = escapeAttr(item.id);
  return `<fieldset class="field-group" data-custom-block="${id}">
    <legend class="field-label">专项支出<em>第 ${index + 1} 项</em><button class="group-remove" type="button" data-remove-custom="${id}">移除</button></legend>
    <div class="field-group-body">
      <label class="field">
        <span class="field-label">名称<em>会写进结果说明</em></span>
        <input type="text" data-custom-id="${id}" data-custom-field="name" value="${escapeAttr(item.name)}" placeholder="比如 装修、父母赡养" />
      </label>
      <div class="field-row">
        <label class="field">
          <span class="field-label">金额<em>万元</em></span>
          <input type="number" data-custom-id="${id}" data-custom-field="amount" min="0" step="1" inputmode="decimal" value="${valueText(item.amount)}" />
        </label>
        <label class="field">
          <span class="field-label">年份<em>工作第几年</em></span>
          <input type="number" data-custom-id="${id}" data-custom-field="year" min="1" step="1" inputmode="numeric" value="${valueText(item.year)}" />
        </label>
      </div>
      <div class="field-row">
        <label class="field">
          <span class="field-label">每月金额<em>万元 / 月</em></span>
          <input type="number" data-custom-id="${id}" data-custom-field="monthly" min="0" step="0.05" inputmode="decimal" value="${valueText(item.monthly)}" />
        </label>
        <label class="field">
          <span class="field-label">月付开始年份<em>工作第几年</em></span>
          <input type="number" data-custom-id="${id}" data-custom-field="monthlyYear" min="1" step="1" inputmode="numeric" value="${valueText(item.monthlyYear)}" />
        </label>
      </div>
      <label class="field">
        <span class="field-label">年数<em>年</em></span>
        <input type="number" data-custom-id="${id}" data-custom-field="years" min="0" step="1" inputmode="numeric" value="${valueText(item.years)}" />
        <small>一次性那笔只付一次；每月那笔按年数付，填 0 就没有月付。都从 0 起，填了金额才开始算。</small>
      </label>
    </div>
  </fieldset>`;
}

function renderCustom() {
  customList.innerHTML = state.custom.map(customMarkup).join("");
}

/** 被移除的块在这里变成「＋ 育儿」这样的按钮，点一下带着默认值回来。 */
function renderRestore() {
  restoreSlot.innerHTML = FIXED_BLOCKS
    .filter((block) => state.removed.includes(block.id))
    .map((block) => `<button class="button button-quiet" type="button" data-restore="${block.id}">＋ ${block.label}</button>`)
    .join("");
}

/** 把 state 写回表单：数值、单选项、被移除的块、自定义专项。 */
function syncForm() {
  for (const input of form.querySelectorAll("[data-field]")) {
    const value = state[input.dataset.field];
    input.value = Number.isFinite(value) ? String(value) : "";
  }
  setRadio(form, "identity", state.identity);
  resizeChildYears();
  syncChildYears();
  for (const block of FIXED_BLOCKS) {
    const node = form.querySelector(`[data-block="${block.id}"]`);
    if (node) node.hidden = state.removed.includes(block.id);
  }
  renderCustom();
  renderRestore();
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

let customSeq = 0;

function addCustom() {
  customSeq += 1;
  state.custom.push({ ...DEFAULT_CUSTOM, id: `c${Date.now().toString(36)}${customSeq}` });
  syncForm();
  update();
}

function removeCustom(id) {
  state.custom = state.custom.filter((item) => item.id !== id);
  syncForm();
  update();
}

function removeBlock(id) {
  if (!state.removed.includes(id)) state.removed.push(id);
  syncForm();
  update();
}

/** 加回来就恢复成默认值，和首次打开页面时一样。 */
function restoreBlock(id) {
  state.removed = state.removed.filter((item) => item !== id);
  for (const [key, value] of Object.entries(BLOCK_DEFAULTS[id] ?? {})) {
    state[key] = Array.isArray(value) ? [...value] : value;
  }
  syncForm();
  update();
}

function handleChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;

  // 自定义专项里的某个框
  if (target.dataset.customId !== undefined && target.dataset.customField) {
    const item = state.custom.find((entry) => entry.id === target.dataset.customId);
    if (!item) return;
    const field = target.dataset.customField;
    item[field] = field === "name" ? target.value : readNumber(target);
    update();
    return;
  }

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

function handleClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.closest("#add-custom")) { addCustom(); return; }
  const removeCustomId = target.closest("[data-remove-custom]")?.dataset.removeCustom;
  if (removeCustomId) { removeCustom(removeCustomId); return; }
  const removeId = target.closest("[data-remove]")?.dataset.remove;
  if (removeId) { removeBlock(removeId); return; }
  const restoreId = target.closest("[data-restore]")?.dataset.restore;
  if (restoreId) restoreBlock(restoreId);
}

form.addEventListener("input", handleChange);
form.addEventListener("change", handleChange);
form.addEventListener("click", handleClick);
salaryPanel.addEventListener("input", handleChange);
salaryPanel.addEventListener("change", handleChange);

document.getElementById("reset").addEventListener("click", () => {
  Object.assign(state, DEFAULTS, {
    childStartYears: [...DEFAULTS.childStartYears],
    removed: [],
    custom: [],
  });
  syncForm();
  syncSalary();
  update();
});

syncForm();
syncSalary();
update();
