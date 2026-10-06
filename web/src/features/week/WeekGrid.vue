<script setup lang="ts">
import { computed } from "vue";
import type { TimeEntry, WeekDay, WeekSegment, WeekView } from "../../api";
import { tagColor, tagLabel } from "../../tags";
import { formatBeijingTime, formatDateHeading } from "../../time";
import WeekExport from "./WeekExport.vue";

const props = defineProps<{ week: WeekView }>();
const emit = defineEmits<{ select: [entry: TimeEntry] }>();
const hourHeight = 52;
const hours = Array.from({ length: 24 }, (_, hour) => hour);
const entriesById = computed(() => new Map(props.week.entries.map((entry) => [entry.id, entry])));

function position(day: WeekDay, segment: WeekSegment) {
  const top = ((segment.startMs - day.startMs) / 3_600_000) * hourHeight;
  const height = ((segment.endMs - segment.startMs) / 3_600_000) * hourHeight;
  return { top: `${top}px`, height: `${Math.max(height, 12)}px` };
}

function selectEntry(id: string) {
  const entry = entriesById.value.get(id);
  if (entry) emit("select", entry);
}

function eventLabel(segment: WeekSegment): string {
  const entry = entriesById.value.get(segment.entryId);
  if (!entry) return "查看记录详情";
  return `${entry.content}，${formatBeijingTime(segment.startMs).slice(11)} 至 ${formatBeijingTime(segment.endMs).slice(11)}，${tagLabel(entry.tag!)}`;
}

</script>

<template>
  <section class="panel week-calendar" aria-labelledby="week-calendar-title">
    <div class="section-heading">
      <div>
        <p class="eyebrow">周时间轴</p>
        <h2 id="week-calendar-title">每日安排</h2>
      </div>
      <span class="calendar-zone">北京时间</span>
    </div>

    <div class="timeline-scroll" aria-label="七天时间轴">
      <div class="week-timeline" :style="{ '--hour-height': `${hourHeight}px` }">
        <div class="timeline-corner">时间</div>
        <div v-for="day in week.days" :key="day.date" class="timeline-day-heading">
          {{ formatDateHeading(day.date) }}
        </div>
        <div class="timeline-hour-labels">
          <span v-for="hour in hours" :key="hour" :style="{ top: `${hour * hourHeight}px` }">
            {{ String(hour).padStart(2, "0") }}:00
          </span>
          <span class="timeline-end-label">24:00</span>
        </div>
        <div v-for="day in week.days" :key="day.date" class="timeline-track">
          <button
            v-for="segment in day.segments"
            :key="segment.entryId"
            :class="['timeline-event', `tag-${tagColor(entriesById.get(segment.entryId)?.tag ?? 'other')}`]"
            :style="position(day, segment)"
            :aria-label="eventLabel(segment)"
            :title="eventLabel(segment)"
            type="button"
            @click="selectEntry(segment.entryId)"
          >
            <span>{{ entriesById.get(segment.entryId)?.content }}</span>
          </button>
        </div>
      </div>
    </div>

    <WeekExport :week="week" />

  </section>
</template>
