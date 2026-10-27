/**
 * 结果卡的 HTML 拼装：只把算好的数字排版成字符串，不碰输入状态与存储。
 * 正推给「需要的资产 + 按收入能撑多久」，反推给「可自由分配 + 每项的独立反推结果」。
 */
import { ITEMS, SOLVABLES, computeAllocation, computeNeed, validate } from "./core/calc.js";
import { formatPercent, formatWan } from "./core/format.js";
import { MAX_YEARS, simulate, solve } from "./core/simulate.js";

/** 反推结果各自带的单位。 */
const UNITS = {
  living: "万元 / 人·月",
  children: "万元 / 孩",
  health: "万元",
  major: "万元",
  salary: "万元 / 月",
  workYears: "年",
};

/** 一个结论块：标题、大字数值、说明。 */
function blockMarkup(label, value, unit, caption) {
  const negative = typeof value === "number" && value < 0;
  const text = typeof value === "number" ? formatWan(value) : value;
  return `<div class="result-block">
    <p class="result-label">${label}</p>
    <p class="result-value${negative ? " is-negative" : ""}">${text}<small>${unit}</small></p>
    <p class="result-caption">${caption}</p>
  </div>`;
}

/** 一条拆解：名称、占比、金额，以及按占比画的条。 */
function breakdownMarkup(label, value, total) {
  const share = total > 0 && Number.isFinite(value) ? (value / total) * 100 : 0;
  const width = Math.max(0, Math.min(100, share)).toFixed(1);
  return `<li>
    <div class="breakdown-line"><span class="breakdown-name">${label}</span><span class="breakdown-share">${formatPercent(share)}</span><span class="breakdown-amount">${formatWan(value)}<em>万</em></span></div>
    <div class="bar"><i style="width: ${width}%"></i></div>
  </li>`;
}

/** 正推：四项金额加总，附一条按占比的拆解。 */
function needMarkup(state) {
  const need = computeNeed(state);
  const rows = ITEMS.map((item) => breakdownMarkup(item.label, need.parts[item.id], need.total)).join("");
  return `<div class="result-block">
    <p class="result-label">财富自由需要的资产</p>
    <p class="result-value">${formatWan(need.total)}<small>万元</small></p>
    <p class="result-caption">一次备齐这些，日常生活、育儿、健康与重大投入都由这笔本金承担。</p>
    <ul class="breakdown">${rows}</ul>
  </div>`;
}

/** 工作结束时攒下的钱够不够付专项支出。 */
function warningMarkup(run) {
  if (run.workEnd === null) {
    const when = !Number.isFinite(run.years)
      ? "工作期间"
      : run.years < 1
        ? `第 ${Math.max(1, Math.round(run.years * 12))} 个月`
        : `第 ${run.years.toFixed(1)} 年`;
    return `<p class="result-warn">按现在的收入与支出，${when}就见底了，撑不到工作结束，专项支出更没钱准备。</p>`;
  }
  if (run.shortfall > 0) {
    return `<p class="result-warn">工作 ${run.workYears} 年攒下约 ${formatWan(run.workEnd)} 万，不够育儿、健康与房子这 ${formatWan(run.oneOff)} 万，还差 ${formatWan(run.shortfall)} 万。</p>`;
  }
  return "";
}

/** 按当前收入逐月推演：这笔钱能撑多少年，以及推演用的口径。 */
function durationMarkup(run, state) {
  const value = !Number.isFinite(run.years)
    ? `${MAX_YEARS}<small>年内花不完</small>`
    : run.years < 1
      ? `${Math.max(1, Math.round(run.years * 12))}<small>个月</small>`
      : `${run.years.toFixed(1)}<small>年</small>`;
  const caption = `从初始资产 ${formatWan(run.start)} 万起，月薪 ${formatWan(Number(state.salary))} 万、每年涨 ${formatPercent(Number(state.salaryGrowth))}，工作 ${run.workYears} 年；育儿、健康与房子共 ${formatWan(run.oneOff)} 万在工作结束那年一次扣掉，生活费按通胀逐年上涨。`;
  return `<div class="result-block">
    <p class="result-label">按现在的收入，钱能撑多久</p>
    <p class="result-value">${value}</p>
    <p class="result-caption">${caption}</p>
  </div>`;
}

/** 反推：拿工作结束时的资产减去固定支出，再把勾中的项单独解出来。 */
function reverseMarkup(state) {
  const run = simulate(state);
  if (run.workEnd === null) {
    return `<div class="result-block">
      <p class="result-label">还不能给出结果</p>
      <p class="result-caption">按现在的收支，还没工作满 ${run.workYears} 年钱就花完了，攒不下可用于分配的资产；先把收入提上去，或把生活费、专项支出压一压。</p>
    </div>`;
  }

  const allocation = computeAllocation(state, state.targets, run.workEnd);
  const fixed = allocation.fixed.length > 0
    ? `已固定：${allocation.fixed.map((item) => `${item.label} ${formatWan(item.amount)} 万`).join(" · ")}`
    : "四项都在待反推里，没有固定的支出。";
  const caption = allocation.free < 0
    ? `工作 ${run.workYears} 年攒下约 ${formatWan(run.workEnd)} 万，比固定的 ${formatWan(allocation.fixedTotal)} 万少了 ${formatWan(Math.abs(allocation.free))} 万，先把这个缺口补上。`
    : `工作 ${run.workYears} 年攒下约 ${formatWan(run.workEnd)} 万，减去固定的 ${formatWan(allocation.fixedTotal)} 万，剩下这些可以自由分配。`;
  const head = `<div class="result-block">
    <p class="result-label">可自由分配</p>
    <p class="result-value${allocation.free < 0 ? " is-negative" : ""}">${formatWan(allocation.free)}<small>万元</small></p>
    <p class="result-caption">${caption}</p>
    <p class="result-note">${fixed}</p>
  </div>`;

  const want = Number(state.targetYears);
  const rows = SOLVABLES.filter((item) => state.targets.includes(item.id)).map((item) => {
    const solved = solve(state, want, item.id);
    const text = solved.feasible
      ? `${formatWan(solved.value, 2)}<em>${UNITS[item.id]}</em>`
      : '<em>按当前其他参数算不出可行值</em>';
    return `<li><span class="solve-name">${item.label}</span><span class="solve-value${solved.feasible ? "" : " is-negative"}">${text}</span></li>`;
  }).join("");

  const tail = `<div class="result-block">
    <p class="result-label">按第 ${formatWan(want)} 年花完反推</p>
    <ul class="solve-list">${rows}</ul>
    <p class="result-caption">其余参数保持当前输入，勾中的每一项各自单独反推；数字表示这一项要多少，钱才刚好撑到第 ${formatWan(want)} 年。</p>
  </div>`;
  return head + tail;
}

/** 把当前状态渲染成结果卡内容；参数不合法时只给中文提示。 */
export function renderResult(state) {
  const targets = state.mode === "reverse" ? state.targets : null;
  const errors = validate(state, targets);
  if (errors.length > 0) {
    return `<p class="result-label">还不能给出结果</p>
      <ul class="result-errors">${errors.map((message) => `<li>${message}</li>`).join("")}</ul>`;
  }
  if (state.mode === "reverse") return reverseMarkup(state);
  const run = simulate(state);
  return needMarkup(state) + warningMarkup(run) + durationMarkup(run, state);
}
