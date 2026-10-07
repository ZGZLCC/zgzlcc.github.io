<script setup lang="ts">
/**
 * 一组「日期 + 时间」：日期用自绘日历，时间用滚动选择器。
 * 时间控件对齐 Chrome 的时间输入：点开后是小时与分钟两列竖条，都能循环滚动。
 */
import { computed, ref, watch } from "vue";
import DatePicker from "./DatePicker.vue";
import TimeWheel from "./TimeWheel.vue";

const props = defineProps<{ date: string; time: string; label: string; disabled?: boolean }>();
const emit = defineEmits<{ "update:date": [value: string]; "update:time": [value: string] }>();

const open = ref(false);

const pad = (value: number) => String(value).padStart(2, "0");

/** 点开时默认落在当前时刻：还没设过就直接预选现在。 */
const nowHour = () => pad(new Date().getHours());
const nowMinute = () => pad(new Date().getMinutes());

const parts = computed(() => ({
  hour: props.time.slice(0, 2) || nowHour(),
  minute: props.time.slice(3, 5) || nowMinute(),
}));

const triggerLabel = computed(() => props.time);

function toggle() {
  if (props.disabled) return;
  open.value = !open.value;
}

function pick(hour: string, minute: string) {
  emit("update:time", `${hour}:${minute}`);
}

watch(
  () => props.disabled,
  (value) => {
    if (value) open.value = false;
  },
);
</script>

<template>
  <fieldset class="date-time-field">
    <legend>{{ label }}</legend>
    <div class="field">
      <span>日期</span>
      <DatePicker :date="date" :label="label" :disabled="disabled" @update:date="emit('update:date', $event)" />
    </div>
    <div class="field time-field">
      <span>时间</span>
      <button
        class="time-field-trigger"
        type="button"
        :disabled="disabled"
        :aria-expanded="open"
        :aria-label="`${triggerLabel || '选择时间'}，${label}`"
        @click="toggle"
      >
        <span :class="{ placeholder: !triggerLabel }">{{ triggerLabel || "--:--" }}</span>
        <svg class="time-field-icon" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.4" />
          <path d="M8 4.5V8l2.5 1.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
        </svg>
      </button>

      <div v-if="open" class="time-field-popover">
        <TimeWheel :hour="parts.hour" :minute="parts.minute" :label="label" @pick="pick" @close="open = false" />
      </div>
    </div>
  </fieldset>
</template>
