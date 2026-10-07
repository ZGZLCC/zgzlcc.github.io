<script setup lang="ts">
/**
 * 自绘日期选择：触发按钮 + 弹出日历。
 * 用 `YYYY-MM-DD` 字符串做值，与项目里日期一律按北京时间字符串处理的约定一致。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { WEEKDAYS, addDays, addMonths, isDate, monthGrid } from "./calendar";

const props = defineProps<{ date: string; label: string; disabled?: boolean; dense?: boolean }>();
const emit = defineEmits<{ "update:date": [value: string] }>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);
const grid = ref<HTMLElement | null>(null);
const month = ref("");
const popover = ref<HTMLElement | null>(null);

const pad = (value: number) => String(value).padStart(2, "0");
const today = (() => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
})();

const triggerLabel = computed(() => (isDate(props.date) ? props.date : ""));
const gridData = computed(() => monthGrid(month.value || today.slice(0, 7)));

async function toggle() {
  if (props.disabled) return;
  open.value = !open.value;
  if (!open.value) return;
  month.value = (isDate(props.date) ? props.date : today).slice(0, 7);
  await nextTick();
  placePopover();
  grid.value?.querySelector<HTMLElement>('[data-selected="1"]')?.focus({ preventScroll: true });
}

/**
 * 按触发按钮的实际坐标摆放面板（`position: fixed`）。
 *
 * 全尺寸共用这一条路径：不能靠包含块与视口单位定位——日期框元素的宽度
 * 只有 100 多像素（周视图的「跳转日期」最窄），`left: 0` 展开必然从右边缘
 * 伸出去；`100vw` 在视觉视口被缩放时又会算出偏大的值，限不住宽度。
 * 量出来的坐标没有这些依赖，缩放、滚动、容器多窄都能对上，宽屏窄屏一致。
 */
function placePopover() {
  const element = popover.value;
  const trigger = root.value?.querySelector<HTMLElement>(".date-picker-trigger");
  if (!element || !trigger) return;

  const margin = 8;
  const gap = 6;
  const box = trigger.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // 限宽：不超过视口可用宽度，也不小于日历能整行放下的宽度
  const width = Math.min(element.offsetWidth || 268, viewportWidth - margin * 2);
  element.style.width = `${width}px`;

  const below = viewportHeight - box.bottom - margin - gap;
  const above = box.top - margin - gap;
  const needed = element.offsetHeight || 320;

  // 下面放得下就放下方；放不下且上方更宽裕就翻上去；都不够就选大的一侧并限高滚动
  if (below < needed && above > below) {
    element.style.maxHeight = `${Math.max(160, above)}px`;
    element.style.top = `${Math.round(Math.max(margin, box.top - gap - Math.min(needed, above)))}px`;
  } else {
    element.style.maxHeight = `${Math.max(160, below)}px`;
    element.style.top = `${Math.round(Math.max(margin, box.bottom + gap))}px`;
  }

  // 横向：优先左对齐触发按钮，再夹进视口
  const left = Math.min(Math.max(margin, box.left), viewportWidth - margin - width);
  element.style.left = `${Math.round(Math.max(margin, left))}px`;
}

function pick(date: string) {
  emit("update:date", date);
  open.value = false;
}

function stepMonth(amount: number) {
  month.value = addMonths(`${month.value || today.slice(0, 7)}-01`, amount).slice(0, 7);
}

/** 方向键按天或按周移动焦点，回车交给按钮自身触发。 */
function onKeydown(event: KeyboardEvent) {
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
  if (step === undefined) return;
  event.preventDefault();
  const target = addDays(isDate(props.date) ? props.date : today, step);
  month.value = target.slice(0, 7);
  void nextTick(() => grid.value?.querySelector<HTMLElement>(`[data-date="${target}"]`)?.focus());
}

function onDocumentPointer(event: PointerEvent) {
  if (open.value && root.value && !root.value.contains(event.target as Node)) open.value = false;
}

/** 页面滚动或窗口尺寸变化后重新摆位，免得面板留在原处对不上按钮。 */
function reposition() {
  if (open.value) placePopover();
}

onMounted(() => {
  document.addEventListener("pointerdown", onDocumentPointer);
  window.addEventListener("resize", reposition);
  window.addEventListener("scroll", reposition, true);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocumentPointer);
  window.removeEventListener("resize", reposition);
  window.removeEventListener("scroll", reposition, true);
});
</script>

<template>
  <div ref="root" :class="['date-picker', { dense }]">
    <button
      class="date-picker-trigger"
      type="button"
      :disabled="disabled"
      :aria-expanded="open"
      :aria-label="`${triggerLabel || '选择日期'}，${label}`"
      @click="toggle"
    >
      <span :class="{ placeholder: !triggerLabel }">{{ triggerLabel || "选择日期" }}</span>
      <svg class="date-picker-icon" viewBox="0 0 16 16" aria-hidden="true">
        <rect x="1.5" y="3.5" width="13" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.4" />
        <path d="M1.5 7h13M5 1.5v4M11 1.5v4" fill="none" stroke="currentColor" stroke-width="1.4" />
      </svg>
    </button>

    <div v-if="open" ref="popover" class="date-picker-popover" role="dialog" :aria-label="`${label}：选择日期`">
      <div class="date-picker-head">
        <button class="date-picker-step" type="button" aria-label="上个月" @click="stepMonth(-1)">‹</button>
        <span class="date-picker-month">{{ gridData.label }}</span>
        <button class="date-picker-step" type="button" aria-label="下个月" @click="stepMonth(1)">›</button>
      </div>

      <div ref="grid" class="date-picker-grid" @keydown="onKeydown">
        <span v-for="day in WEEKDAYS" :key="day" class="date-picker-weekday" aria-hidden="true">{{ day }}</span>
        <button
          v-for="cell in gridData.cells"
          :key="cell.date"
          class="date-picker-day"
          :class="{ outside: !cell.currentMonth, selected: cell.date === date, today: cell.date === today }"
          type="button"
          :data-date="cell.date"
          :data-selected="cell.date === date ? '1' : undefined"
          :aria-pressed="cell.date === date"
          :aria-label="cell.date"
          @click="pick(cell.date)"
        >
          {{ cell.day }}
        </button>
      </div>

      <div class="date-picker-foot">
        <button class="button button-quiet" type="button" @click="pick(today)">今天</button>
      </div>
    </div>
  </div>
</template>
