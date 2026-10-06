<script setup lang="ts">
import type { WeekTotals } from "../../api";
import { TAGS } from "../../tags";
import { formatDurationMinutes } from "../../time";

const props = defineProps<{ title: string; totals: WeekTotals }>();

function durationFor(tag: (typeof TAGS)[number]["value"]): string {
  return formatDurationMinutes(props.totals[`${tag}Ms`]);
}
</script>

<template>
  <section class="panel week-stats" :aria-label="title">
    <div class="section-heading">
      <div>
        <p class="eyebrow">仅统计已完成记录</p>
        <h2>{{ title }}</h2>
      </div>
    </div>
    <div class="week-stat-grid">
      <div v-for="tag in TAGS" :key="tag.value" class="week-stat-item">
        <span :class="`tag tag-${tag.color}`">{{ tag.label }}</span>
        <strong>{{ durationFor(tag.value) }}</strong>
      </div>
    </div>
  </section>
</template>
