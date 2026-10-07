<script setup lang="ts">
/**
 * 滚动时间选择器：小时与分钟两列竖条，样式与交互对齐 Chrome 的时间控件。
 *
 * 两列都能无限循环：59 后面是 0，23 后面是 0。做法是把列表渲染三份，
 * 滚到外侧那份时把 `scrollTop` 平移回中间那份——三份内容相同，
 * 平移前后画面完全一样，看不出接缝，于是就成了循环。
 *
 * 上下各留一条与选中条等高的内边距，这样首项和末项也能滚到正中。
 */
import { nextTick, onBeforeUnmount, onMounted, ref } from "vue";

const props = defineProps<{ hour: string; minute: string; label: string }>();
const emit = defineEmits<{ pick: [hour: string, minute: string]; close: [] }>();

const STEP = 40;
/**
 * 上下内边距，等于两条项的高度：列表高 200，带子在列表内 80..120。
 * 在这套几何下，下标 i 的项正好落在 `scrollTop = i * STEP` 处，
 * 所以两个方向的换算只需乘除 STEP。padding 由 date-time.css 设置。
 */
const pad = (value: number) => String(value).padStart(2, "0");
const HOURS = Array.from({ length: 24 }, (_, index) => pad(index));
const MINUTES = Array.from({ length: 60 }, (_, index) => pad(index));
/** 渲染三份：外侧两份只用来接住边界，滚动时再平移回中间。 */
const COPIES = [0, 1, 2];

const hourList = ref<HTMLElement | null>(null);
const minuteList = ref<HTMLElement | null>(null);
const root = ref<HTMLElement | null>(null);
const hour = ref(props.hour || "00");
const minute = ref(props.minute || "00");
/** 当前居中项的下标，用来算高亮；不直接改 DOM，免得触发滚动锚定。 */
const hourIndex = ref(0);
const minuteIndex = ref(0);

const indexAt = (list: HTMLElement | null) => Math.round((list?.scrollTop ?? 0) / STEP);
const scrollFor = (index: number) => index * STEP;

/** 把某一列滚到指定值所在的中间那份。 */
function recenter(list: HTMLElement | null, items: string[], value: string) {
  if (!list) return;
  list.scrollTop = scrollFor(items.length + Math.max(0, items.indexOf(value)));
}

/** 滚到某个值，选离当前最近的那一份，别让列表白滚一圈。 */
function centerOn(list: HTMLElement | null, items: string[], value: string) {
  if (!list) return;
  const index = Math.max(0, items.indexOf(value));
  const at = indexAt(list);
  const best = [index - items.length, index, index + items.length].reduce((a, b) =>
    Math.abs(b - at) < Math.abs(a - at) ? b : a,
  );
  list.scrollTop = scrollFor(best);
}

const valueAt = (list: HTMLElement | null, items: string[]) =>
  items[((indexAt(list) % items.length) + items.length) % items.length];

let settle: ReturnType<typeof setTimeout> | undefined;

/** 滚动过程中只更新下标；真正的提交与平移等停下来再做。 */
function onScroll() {
  hourIndex.value = indexAt(hourList.value);
  minuteIndex.value = indexAt(minuteList.value);
  if (settle) clearTimeout(settle);
  settle = setTimeout(settleNow, 120);
}

function settleNow() {
  // 滚进第一份或第三份就平移回中间那份：三份内容相同，接缝看不出来
  for (const [list, items] of [
    [hourList.value, HOURS],
    [minuteList.value, MINUTES],
  ] as [HTMLElement | null, string[]][]) {
    if (!list) continue;
    const index = indexAt(list);
    if (index < items.length || index >= items.length * 2) {
      list.scrollTop = scrollFor(items.length + (((index % items.length) + items.length) % items.length));
    }
  }
  hourIndex.value = indexAt(hourList.value);
  minuteIndex.value = indexAt(minuteList.value);
  hour.value = valueAt(hourList.value, HOURS);
  minute.value = valueAt(minuteList.value, MINUTES);
  emit("pick", hour.value, minute.value);
}

/** 点某一项就选它，并把它挪到正中。 */
function choose(which: "hour" | "minute", value: string) {
  if (which === "hour") {
    hour.value = value;
    centerOn(hourList.value, HOURS, value);
    hourIndex.value = indexAt(hourList.value);
  } else {
    minute.value = value;
    centerOn(minuteList.value, MINUTES, value);
    minuteIndex.value = indexAt(minuteList.value);
  }
  emit("pick", hour.value, minute.value);
}

function onKeydown(event: KeyboardEvent, which: "hour" | "minute") {
  const step = { ArrowUp: -1, ArrowDown: 1 }[event.key];
  if (step === undefined) return;
  event.preventDefault();
  const items = which === "hour" ? HOURS : MINUTES;
  const list = which === "hour" ? hourList.value : minuteList.value;
  const index = indexAt(list) + step;
  choose(which, items[((index % items.length) + items.length) % items.length]);
}

function onDocumentPointer(event: PointerEvent) {
  if (root.value && !root.value.contains(event.target as Node)) emit("close");
}

/** 等浏览器把布局做完再定位。 */
const afterLayout = () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

/** 把滚动位置摆到选中项上，并把下标记下来算高亮。 */
function placeOnSelection() {
  recenter(hourList.value, HOURS, hour.value);
  recenter(minuteList.value, MINUTES, minute.value);
  hourIndex.value = indexAt(hourList.value);
  minuteIndex.value = indexAt(minuteList.value);
}

onMounted(async () => {
  await nextTick();
  // 必须等布局完成再设 scrollTop：列表刚插进 DOM 时 scrollHeight 还只有一屏，
  // 这时写 scrollTop 会被浏览器夹到最大值，结果停不到选中项。
  await afterLayout();
  placeOnSelection();
  // 面板打开时日期选择器会把焦点移进日历，浏览器的「聚焦即滚动」会顺带改掉
  // 这里的滚动位置。等这一轮过去再摆一次，确保停在选中项上。
  setTimeout(placeOnSelection, 0);
  document.addEventListener("pointerdown", onDocumentPointer);
});

onBeforeUnmount(() => {
  if (settle) clearTimeout(settle);
  document.removeEventListener("pointerdown", onDocumentPointer);
});
</script>

<template>
  <div ref="root" class="time-wheel" role="dialog" :aria-label="`${label}：选择时间`">
    <div class="time-wheel-columns">
      <div class="time-wheel-band" aria-hidden="true" />

      <div
        ref="hourList"
        class="time-wheel-list"
        role="listbox"
        :aria-label="`${label}：小时`"
        tabindex="0"
        @scroll="onScroll"
        @keydown="onKeydown($event, 'hour')"
      >
        <template v-for="copy in COPIES" :key="`h${copy}`">
          <button
            v-for="(value, index) in HOURS"
            :key="`h${copy}-${value}`"
            class="time-wheel-item"
            :class="{ active: copy * HOURS.length + index === hourIndex }"
            type="button"
            role="option"
            :aria-selected="value === hour"
            @click="choose('hour', value)"
          >
            {{ value }}
          </button>
        </template>
      </div>

      <div
        ref="minuteList"
        class="time-wheel-list"
        role="listbox"
        :aria-label="`${label}：分钟`"
        tabindex="0"
        @scroll="onScroll"
        @keydown="onKeydown($event, 'minute')"
      >
        <template v-for="copy in COPIES" :key="`m${copy}`">
          <button
            v-for="(value, index) in MINUTES"
            :key="`m${copy}-${value}`"
            class="time-wheel-item"
            :class="{ active: copy * MINUTES.length + index === minuteIndex }"
            type="button"
            role="option"
            :aria-selected="value === minute"
            @click="choose('minute', value)"
          >
            {{ value }}
          </button>
        </template>
      </div>
    </div>
  </div>
</template>
