/**
 * 两张结果卡：工作这些年能攒下多少，以及这笔钱能撑多少年。
 * 只把算好的数字排版成 HTML 字符串，不碰输入状态与存储。
 */
import { CHILD_YEARS, childStartYears, customItems, customName } from "./core/calc.js";
import { formatPercent, formatWan } from "./core/format.js";
import { accumulate, runwayMonths } from "./core/simulate.js";

/** 月份数换成「几个月 / 几年」，给提示文案用。 */
function whenText(month) {
  return month < 12 ? `${Math.max(1, Math.round(month))} 个月` : `${(month / 12).toFixed(1)} 年`;
}

/** 专项支出的逐月扣款说明；没有工作年份时这些一分没扣，就不写了。 */
function spendMarkup(state, run) {
  if (run.workYears <= 0) return "";
  const notes = [];
  const years = childStartYears(state);
  if (run.childTotal > 0) {
    const start = years.length === 1
      ? `从第 ${years[0]} 年开始`
      : `各自从第 ${years.join("、")} 年开始`;
    notes.push(`育儿 ${formatWan(run.childTotal)} 万按 ${CHILD_YEARS} 年摊到每月、${start}，工作这些年扣掉 ${formatWan(run.childSpent)} 万。`);
  }
  if (run.houseTotal > 0) {
    // 年份与 simulate 的 firstMonthOfYear 对齐：空着或填 0 都按第 1 年说
    const yearOf = (value) => Math.max(1, Math.round(Number(value) || 0));
    const down = yearOf(state.houseDownYear);
    const monthlyYear = yearOf(state.houseMonthlyYear);
    const years = Math.round(Number(state.houseYears) || 0);
    const downAmount = Number.isFinite(Number(state.houseDown)) ? Number(state.houseDown) : 0;
    const monthly = Number.isFinite(Number(state.houseMonthly)) ? Number(state.houseMonthly) : 0;
    const parts = [];
    if (downAmount > 0) parts.push(`首付 ${formatWan(downAmount)} 万在第 ${down} 年一次付`);
    if (monthly > 0 && years > 0) {
      parts.push(`月供 ${formatWan(monthly, 2)} 万 × 12 × ${years} 年从第 ${monthlyYear} 年起扣`);
    } else {
      parts.push("全款，没有月供");
    }
    notes.push(`房子 ${formatWan(run.houseTotal)} 万：${parts.join("，")}，工作这些年扣掉 ${formatWan(run.houseSpent)} 万。`);
  }
  // 用户自己加的专项支出：用他们填的名字来写
  customItems(state).forEach((item, index) => {
    const stat = run.custom[index];
    if (!stat || stat.total <= 0) return;
    const parts = [];
    if (item.amount > 0) parts.push(`第 ${item.year} 年一次付 ${formatWan(item.amount)} 万`);
    if (item.monthly > 0 && item.years > 0) {
      parts.push(`从第 ${item.monthlyYear} 年起每月 ${formatWan(item.monthly, 2)} 万，付 ${item.years} 年`);
    }
    notes.push(`「${customName(item)}」共 ${formatWan(stat.total)} 万：${parts.join("，")}，工作这些年扣掉 ${formatWan(stat.spent)} 万。`);
  });
  return notes.map((note) => `<p class="result-note">${note}</p>`).join("");
}

/** 工作结束后还要继续付的项，按项列出「房贷 26.4 万」这种说法。 */
function pendingParts(run) {
  const parts = [];
  if (run.childPending > 0.05) parts.push(`育儿 ${formatWan(run.childPending)} 万`);
  if (run.housePending > 0.05) parts.push(`房贷 ${formatWan(run.housePending)} 万`);
  for (const item of run.custom) {
    if (item.pending > 0.05) parts.push(`${item.name} ${formatWan(item.pending)} 万`);
  }
  return parts;
}

/** 每一段「被大额支出打穿」的欠款各写一条，末尾补一句规则说明。 */
function debtNotes(run) {
  if (!run.debts || run.debts.length === 0) return "";
  const label = (item) => `${item.name}${item.name.endsWith("」") ? "" : " "}${formatWan(item.amount)} 万`;
  const lines = run.debts.map((debt) => {
    const cause = debt.causes && debt.causes.length > 0
      ? debt.causes.map(label).join("、")
      : "一笔大额支出";
    const back = debt.end === null
      ? "之后一直没回到正数"
      : `第 ${whenText(debt.end)}才回到正数`;
    return `<p class="result-note">第 ${whenText(debt.start)}的${cause}让余额掉到 ${formatWan(debt.startBalance)} 万，${back}。</p>`;
  });
  return `${lines.join("")}<p class="result-note">欠款期间不算收益，每月结余都拿去还，还清之后余额才重新开始增值。</p>`;
}

/**
 * 工作结束时的余额怎么变成大数字：只预留医疗；
 * 没付完的育儿 / 房贷 / 自定义专项照实提示还有多少，但不在这一步扣，交给「能撑多少年」按月继续扣。
 */
function reserveNote(run) {
  const parts = [`工作结束时手上 ${formatWan(run.saved)} 万`];
  if (run.health > 0) parts.push(`预留 ${formatWan(run.health)} 万用于医疗等方面`);
  const lead = run.health > 0 ? `，剩下的就是上面这笔。` : `，就是上面这笔。`;
  const later = pendingParts(run);
  const pending = later.length > 0
    ? `<p class="result-note">另外${later.join("、")}要在工作结束后继续付，没从上面这笔里扣。</p>`
    : "";
  return `<p class="result-note">${parts.join("，")}${lead}</p>${pending}`;
}

/** 增长率写成「每年涨 / 每年降」，0 说工资不变，负数是降薪。 */
function rateText(rate) {
  const value = Number(rate);
  if (!Number.isFinite(value) || value === 0) return "工资不变";
  return value > 0 ? `每年涨 ${formatPercent(value)}` : `每年降 ${formatPercent(Math.abs(value))}`;
}

/** 涨薪那段话：只有一段时不写「接着 0 年」；两段都不涨就说「工资一直不变」。 */
function growthText(state, earlyYears, lateYears) {
  const early = rateText(state.salaryGrowthEarly);
  const late = rateText(state.salaryGrowthLate);
  if (earlyYears > 0 && lateYears > 0) {
    if (early === "工资不变" && late === "工资不变") return "工资一直不变";
    return `前 ${earlyYears} 年${early}，接着 ${lateYears} 年${late}`;
  }
  if (earlyYears > 0) return early === "工资不变" ? "工资一直不变" : early;
  if (lateYears > 0) return late === "工资不变" ? "工资一直不变" : late;
  return "";
}

/** 口径说明：工作时长为 0 时只说初始资金，不写工资与生活费。 */
function captionText(state, run, earlyYears, lateYears) {
  if (run.workYears <= 0) {
    return `工作时长是 0 年：没有工资进账，也不扣生活费，手上只有初始资金 ${formatWan(run.start)} 万。`;
  }
  const annual = Number.isFinite(state.annualSalary) ? state.annualSalary : 0;
  const growth = growthText(state, earlyYears, lateYears);
  return `从初始资金 ${formatWan(run.start)} 万起，年均工资 ${formatWan(annual)} 万；${growth}；工作 ${run.workYears} 年，每月生活费 ${formatWan(run.monthlySpend)} 万按通胀上涨，收益按 ${formatPercent(Number(state.rate))} 计。`;
}

/** 工作这些年能攒下多少；最后留下的钱已经扣掉育儿、房贷与医疗预留。 */
export function renderSalary(state) {
  const run = accumulate(state);
  const earlyYears = Math.round(Number(state.salaryGrowthYears) || 0);
  const lateYears = Math.round(Number(state.salaryGrowthLateYears) || 0);
  const caption = captionText(state, run, earlyYears, lateYears);
  const label = run.workYears > 0 ? `工作 ${run.workYears} 年后能攒下` : "按现在的设置能攒下";
  const spend = spendMarkup(state, run);

  // 余额在非大额月份转负：这套收支撑不住，推演停在那里
  if (run.stopped !== null) {
    // 一次大额都还没花，说明是生活费 / 育儿这些固定开支撑不住，提示换个方向
    const advice = run.houseSpent === 0 && run.custom.every((item) => item.spent === 0)
      ? "工资撑不住生活费与育儿这些固定开支：把生活费压一压，或者把工资、初始资金填高一点。"
      : "只有一次性大额（首付、自定义专项）那个月允许透支，其他月份余额必须为正：把那些支出推后、压低，或者把工资填高一点。";
    return `<p class="result-label">${label}</p>
      <p class="result-value">0<small>万元</small></p>
      <p class="result-caption">${caption}</p>
      ${spend}
      ${debtNotes(run)}
      <p class="result-warn">第 ${whenText(run.stopped)}余额掉到 ${formatWan(run.stopBalance)} 万，推演停在这里。${advice}</p>`;
  }

  // 有一段欠款到工作结束都没还清
  const openDebt = run.debts.find((debt) => debt.end === null);
  if (openDebt) {
    return `<p class="result-label">${label}</p>
      <p class="result-value">0<small>万元</small></p>
      <p class="result-caption">${caption}</p>
      ${spend}
      ${debtNotes(run)}
      <p class="result-warn">到工作结束还在欠钱（最低 ${formatWan(run.lowest)} 万）；把首付或自定义专项压低、往后挪。</p>`;
  }

  if (run.saved <= 0) {
    const warn = run.workYears > 0
      ? "最后余额正好是 0，没有可攒下的钱；把生活费、育儿与房贷压一压，或者把工资填高一点。"
      : "工作时长和初始资金都是 0，没有可攒下的钱；把工作时长或初始资金填上再看。";
    return `<p class="result-label">${label}</p>
      <p class="result-value">0<small>万元</small></p>
      <p class="result-caption">${caption}</p>
      ${spend}
      <p class="result-warn">${warn}</p>`;
  }

  const dip = debtNotes(run);

  if (run.left < 0) {
    return `<p class="result-label">${label}</p>
      <p class="result-value">0<small>万元</small></p>
      <p class="result-caption">${caption}</p>
      ${spend}
      ${dip}
      ${reserveNote(run)}
      <p class="result-warn">预留医疗之后还差 ${formatWan(Math.abs(run.left))} 万：把医疗预留压一压，或者把工作时长拉长一点。</p>`;
  }

  return `<p class="result-label">${label}</p>
    <p class="result-value">${formatWan(run.left)}<small>万元</small></p>
    <p class="result-caption">${caption}</p>
    ${spend}
    ${dip}
    ${reserveNote(run)}`;
}

/** 工作结束后这笔钱能撑多久：余额按收益率增值，生活费按通胀涨，没付完的育儿与房贷继续按月扣。 */
export function renderRunway(state) {
  const run = accumulate(state);
  const head = "<p class=\"result-label\">这笔钱能撑</p>";

  if (run.stopped !== null) {
    return `${head}
      <p class="result-value">0<small>年</small></p>
      <p class="result-caption">前面的推演半路就停了，没有可支撑的钱。</p>`;
  }

  const amount = run.left;
  if (!(amount > 0)) {
    return `${head}
      <p class="result-value">0<small>年</small></p>
      <p class="result-caption">预留医疗之后没有剩下的钱，撑不了。</p>`;
  }

  const rate = Number(state.rate);
  const inflation = Number(state.inflation);
  const monthly = run.monthlySpendAfterWork;
  const months = runwayMonths(state, amount);
  const later = pendingParts(run);
  const tail = later.length > 0
    ? `，没付完的${later.join("、")}也继续按月扣`
    : "，专项支出都已经付完";
  const caption = `从 ${formatWan(amount)} 万起，按工作结束时每月 ${formatWan(monthly)} 万的生活费（之后继续按 ${formatPercent(inflation)} 通胀上涨）、年收益 ${formatPercent(rate)} 算${tail}。`;

  if (months === Infinity) {
    return `${head}
      <p class="result-value">永远</p>
      <p class="result-caption">${caption}</p>
      <p class="result-note">收益跑得过通胀与花销，这笔钱花不完。</p>`;
  }

  const years = months / 12;
  const value = years >= 1 ? formatWan(years) : String(Math.max(1, Math.round(months)));
  const unit = years >= 1 ? "年" : "个月";
  return `${head}
    <p class="result-value">${value}<small>${unit}</small></p>
    <p class="result-caption">${caption}</p>`;
}
