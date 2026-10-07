<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { TimeEntry } from "../../api";
import DateJump from "../../components/DateJump.vue";
import { recordsOnDay } from "../../day-range";
import { tagColor, tagLabel } from "../../tags";
import { formatBeijingTime } from "../../time";

const props = defineProps<{ pending: TimeEntry[]; completed: TimeEntry[]; busy: boolean }>();
const emit = defineEmits<{
  edit: [entry: TimeEntry];
  delete: [entry: TimeEntry];
}>();

function title(entry: TimeEntry): string {
  return entry.content || "待补全记录";
}

/** 正文：内容可以是空的（有起止时间和标签就算完整记录），空的时候给一句说明。 */
function body(entry: TimeEntry): string {
  return entry.content || "（未填写内容）";
}

function displayTime(timestamp: number | null, date: string | null): string {
  return timestamp != null ? formatBeijingTime(timestamp) : `${date ?? "xxxx-xx-xx"} xx:xx`;
}

const historyScroll = ref<HTMLElement | null>(null);
const historyMaxHeight = ref<number | null>(null);
const selectedDate = ref("");
const jumpDate = ref("");
const dayEntries = computed(() => recordsOnDay(props.completed, selectedDate.value));

/** 起止时间，例如 `2026-10-06 18:36 → 2026-10-06 19:19`。 */
function timeRange(entry: TimeEntry): string {
  return `${displayTime(entry.startMs, entry.startDate)} → ${displayTime(entry.endMs, entry.endDate)}`;
}

/** 与待补全一致：最多完整显示五条，其余在卡片内滚动。 */
function sizeHistory() {
  const card = historyScroll.value?.querySelector<HTMLElement>(".record-card");
  historyMaxHeight.value = card ? Math.round(card.getBoundingClientRect().height * 5) : null;
}

watch(dayEntries, async () => {
  if (!selectedDate.value) return;
  await nextTick();
  historyScroll.value?.scrollTo({ top: 0 });
}, { flush: "post" });

function clearFilter() {
  selectedDate.value = "";
}

onMounted(() => {
  sizeHistory();
  window.addEventListener("resize", sizeHistory);
});
onBeforeUnmount(() => window.removeEventListener("resize", sizeHistory));
</script>

<template>
  <div class="record-sections">
    <section class="panel pending-panel" aria-labelledby="pending-title">
      <div class="section-heading">
        <div>
          <p class="eyebrow">尚未完成</p>
          <h2 id="pending-title">待补全 <span class="count">{{ pending.length }}</span></h2>
        </div>
      </div>
      <p v-if="pending.length === 0" class="empty-state pending-empty">暂无待补全记录</p>
      <div v-else class="pending-scroll">
      <article v-for="entry in pending" :key="entry.id" class="record-card">
        <div class="record-main">
          <p class="record-time time-range">
            <span>{{ displayTime(entry.startMs, entry.startDate) }} <span aria-hidden="true">→</span></span>
            <span>{{ displayTime(entry.endMs, entry.endDate) }}</span>
          </p>
        </div>
        <div class="record-actions">
          <button class="button button-quiet" type="button" :disabled="busy" @click="emit('edit', entry)">补全</button>
          <button class="button button-danger-quiet" type="button" :disabled="busy" :aria-label="`删除记录：${title(entry)}`" @click="emit('delete', entry)">删除</button>
        </div>
      </article>
      </div>
    </section>

    <section class="panel history-panel" aria-labelledby="history-title">
      <div class="section-heading history-heading">
        <div>
          <p class="eyebrow">已保存</p>
          <h2 id="history-title">记录历史 <span class="count">{{ dayEntries.length }}</span></h2>
        </div>
        <DateJump v-model:date="jumpDate" :reset-label="selectedDate ? '全部' : undefined" :disabled="busy" @update:date="selectedDate = jumpDate" @reset="clearFilter" />
      </div>
      <p v-if="dayEntries.length === 0" class="empty-state">
        {{ selectedDate ? `${selectedDate} 没有已完成记录` : "保存后的记录会显示在这里" }}
      </p>
      <div
        v-else
        ref="historyScroll"
        class="history-scroll"
        :style="{ maxHeight: historyMaxHeight == null ? undefined : `${historyMaxHeight}px` }"
      >
        <article v-for="entry in dayEntries" :key="entry.id" class="record-card">
          <div class="record-main">
            <div class="record-title-row">
              <h4 class="history-time">{{ timeRange(entry) }}</h4>
              <span v-if="entry.tag" :class="`tag tag-${tagColor(entry.tag)}`">{{ tagLabel(entry.tag) }}</span>
            </div>
            <p class="history-content">{{ body(entry) }}</p>
          </div>
          <div class="record-actions">
            <button class="button button-quiet" type="button" :disabled="busy" @click="emit('edit', entry)">编辑</button>
            <button class="button button-danger-quiet" type="button" :disabled="busy" :aria-label="`删除记录：${title(entry)}`" @click="emit('delete', entry)">删除</button>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>
