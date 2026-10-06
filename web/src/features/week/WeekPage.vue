<script setup lang="ts">
import { computed, nextTick, onActivated, ref } from "vue";
import { getAllTotals, getDayTotals, getWeek, listPending } from "../../api";
import type { TimeEntry, WeekTotals, WeekView } from "../../api";
import { messageOf } from "../../core/errors";
import { tagColor, tagLabel } from "../../tags";
import { beijingToday, formatBeijingTime, formatWeekRange, shiftDate } from "../../time";
import DateJump from "../../components/DateJump.vue";
import DayStats from "./DayStats.vue";
import WeekGrid from "./WeekGrid.vue";
import WeekStats from "./WeekStats.vue";

const emit = defineEmits<{
  edit: [entry: TimeEntry];
  openRecords: [];
}>();

const selectedDate = ref(beijingToday());
const week = ref<WeekView | null>(null);
const allTotals = ref<WeekTotals | null>(null);
const dayTotals = ref<WeekTotals | null>(null);
const dayDate = ref("");
const today = ref(beijingToday());
const selectedEntry = ref<TimeEntry | null>(null);
const detailSection = ref<HTMLElement | null>(null);
const pendingCount = ref<number | null>(null);
const loading = ref(false);
const error = ref("");

const title = computed(() => week.value
  ? formatWeekRange(week.value.days[0].date, week.value.days[6].date)
  : "周视图");

onActivated(() => {
  void loadWeek(selectedDate.value);
  void loadPendingCount();
});

async function loadWeek(date: string) {
  if (!date) {
    error.value = "请选择一个日期";
    return;
  }
  loading.value = true;
  error.value = "";
  today.value = beijingToday();
  try {
    const [newWeek, totals, day] = await Promise.all([
      getWeek(date),
      getAllTotals(),
      getDayTotals(date),
    ]);
    week.value = newWeek;
    allTotals.value = totals;
    dayTotals.value = day;
    dayDate.value = newWeek.selectedDate;
    selectedDate.value = newWeek.selectedDate;
    selectedEntry.value = null;
  } catch (reason: unknown) {
    error.value = messageOf(reason, "读取记录失败，请刷新页面后重试。");
  } finally {
    loading.value = false;
  }
}

async function loadPendingCount() {
  pendingCount.value = null;
  try {
    pendingCount.value = (await listPending()).length;
  } catch (reason: unknown) {
    error.value = messageOf(reason, "读取记录失败，请刷新页面后重试。");
  }
}

async function moveWeek(amount: number) {
  const monday = week.value?.days[0].date ?? selectedDate.value;
  await loadWeek(shiftDate(monday, amount * 7));
}

function showToday() {
  void loadWeek(beijingToday());
}

async function showEntry(entry: TimeEntry) {
  selectedEntry.value = entry;
  await nextTick();
  detailSection.value?.scrollIntoView({ block: "start" });
  detailSection.value?.focus({ preventScroll: true });
}
</script>

<template>
  <div class="week-page">
    <section class="panel week-toolbar" aria-labelledby="week-title">
      <div class="week-toolbar-heading">
        <p class="eyebrow">查看与统计</p>
        <h2 id="week-title">{{ title }}</h2>
      </div>
      <div class="week-controls">
        <button class="button button-quiet week-arrow" type="button" aria-label="上一周" :disabled="loading" @click="moveWeek(-1)">←</button>
        <button class="button button-quiet" type="button" :disabled="loading" @click="showToday">本周</button>
        <button class="button button-quiet week-arrow" type="button" aria-label="下一周" :disabled="loading" @click="moveWeek(1)">→</button>
        <DateJump v-model:date="selectedDate" :disabled="loading" @update:date="loadWeek" />
        <button class="button button-secondary pending-link" type="button" :disabled="pendingCount === null" @click="emit('openRecords')">
          待补全 {{ pendingCount ?? "…" }}
        </button>
      </div>
    </section>

    <p v-if="error" class="page-status page-status-error" role="alert">{{ error }}</p>
    <p v-if="loading && !week" class="page-status" role="status">正在读取本周记录…</p>

    <template v-if="week">
      <DayStats v-if="dayTotals" :date="dayDate" :today="today" :totals="dayTotals" />
      <WeekStats title="本周已记录" :totals="week.totals" />
      <WeekStats v-if="allTotals" title="累计记录时长" :totals="allTotals" />

      <section v-if="selectedEntry" ref="detailSection" class="panel week-detail" aria-labelledby="week-detail-title" tabindex="-1">
        <div class="week-detail-copy">
          <p class="eyebrow">记录详情</p>
          <h2 id="week-detail-title">
            {{ formatBeijingTime(selectedEntry.startMs!) }} → {{ formatBeijingTime(selectedEntry.endMs!) }}
          </h2>
          <p class="week-detail-content">{{ selectedEntry.content }}</p>
        </div>
        <div class="week-detail-actions">
          <span v-if="selectedEntry.tag" :class="`tag tag-${tagColor(selectedEntry.tag)}`">
            {{ tagLabel(selectedEntry.tag) }}
          </span>
          <button class="button button-primary" type="button" @click="emit('edit', selectedEntry)">编辑记录</button>
        </div>
      </section>

      <WeekGrid :week="week" @select="showEntry" />
    </template>

    <p v-if="week?.entries.length === 0" class="page-status">本周暂无已完成记录，空白时段会保持留白。</p>
  </div>
</template>
