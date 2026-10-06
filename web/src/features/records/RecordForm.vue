<script setup lang="ts">
import { ref, watch } from "vue";
import type { SaveEntryInput, TimeEntry } from "../../api";
import { TAGS, type EntryTag } from "../../tags";
import { beijingToday, fromBeijingInput, toBeijingInput } from "../../time";

const props = defineProps<{ entry: TimeEntry | null; busy: boolean; error: string }>();
const emit = defineEmits<{ save: [input: SaveEntryInput]; cancel: [] }>();

const startDate = ref("");
const startTime = ref("");
const endDate = ref("");
const endTime = ref("");
const content = ref("");
const tag = ref<EntryTag | null>(null);
const validation = ref("");

watch(() => props.entry, reset, { immediate: true });

function reset(entry: TimeEntry | null) {
  const start = entry?.startMs != null ? toBeijingInput(entry.startMs) : "";
  const end = entry?.endMs != null ? toBeijingInput(entry.endMs) : "";
  startDate.value = entry?.startDate ?? start.slice(0, 10);
  startTime.value = start.slice(11, 16);
  endDate.value = entry?.endDate ?? end.slice(0, 10);
  endTime.value = end.slice(11, 16);
  content.value = entry?.content ?? "";
  tag.value = entry?.tag ?? null;
  validation.value = "";
}

function syncDate(source: "start" | "end") {
  if (source === "start" && startDate.value && !endDate.value) endDate.value = startDate.value;
  if (source === "end" && endDate.value && !startDate.value) startDate.value = endDate.value;
}

function syncTime(source: "start" | "end") {
  if (source === "start" && startTime.value && !startDate.value) startDate.value = beijingToday();
  if (source === "end" && endTime.value && !endDate.value) endDate.value = beijingToday();
  syncDate(source);
}

function timestamp(date: string, time: string, original: number | null): number | null {
  if (!date || !time) return null;
  const input = `${date}T${time}`;
  return original != null && toBeijingInput(original) === input ? original : fromBeijingInput(input);
}

function submit() {
  try {
    const startMs = timestamp(startDate.value, startTime.value, props.entry?.startMs ?? null);
    const endMs = timestamp(endDate.value, endTime.value, props.entry?.endMs ?? null);
    const trimmed = content.value.trim();
    if (startMs != null && endMs != null && endMs <= startMs) throw new Error("结束时间必须晚于开始时间");
    if (Array.from(trimmed).length > 500) throw new Error("事情内容不得超过 500 个字符");
    if (!startDate.value && !endDate.value && !startTime.value && !endTime.value && !trimmed && !tag.value) {
      throw new Error("请至少填写一项记录内容");
    }
    validation.value = "";
    emit("save", { id: props.entry?.id, startMs, endMs, startDate: startDate.value || null, endDate: endDate.value || null, content: trimmed, tag: tag.value });
  } catch (error: unknown) {
    validation.value = error instanceof Error ? error.message : "请检查输入内容";
  }
}
</script>

<template>
  <section class="panel form-panel" aria-labelledby="form-title">
    <div class="section-heading">
      <div>
        <p class="eyebrow">记录详情</p>
        <h2 id="form-title">{{ entry ? "编辑记录" : "手动记录" }}</h2>
      </div>
      <button v-if="entry" class="button button-quiet" type="button" :disabled="busy" @click="emit('cancel')">取消编辑</button>
    </div>

    <form class="record-form" novalidate @submit.prevent="submit">
      <div class="form-grid">
        <fieldset class="date-time-field">
          <legend>开始时间（北京时间）</legend>
          <label class="field"><span>日期</span><input v-model="startDate" type="date" @change="syncDate('start')" /></label>
          <label class="field"><span>时间</span><input v-model="startTime" type="time" @change="syncTime('start')" /></label>
        </fieldset>
        <fieldset class="date-time-field">
          <legend>结束时间（北京时间）</legend>
          <label class="field"><span>日期</span><input v-model="endDate" type="date" @change="syncDate('end')" /></label>
          <label class="field"><span>时间</span><input v-model="endTime" type="time" @change="syncTime('end')" /></label>
        </fieldset>
      </div>
      <label class="field">
        <span>事情内容</span>
        <textarea v-model="content" rows="3" placeholder="记录这段时间做了什么" />
        <small>{{ Array.from(content).length }} / 500</small>
      </label>
      <fieldset class="field tag-field">
        <legend>标签</legend>
        <button v-for="option in TAGS" :key="option.value" class="tag-option" :class="{ selected: tag === option.value }" type="button" :aria-pressed="tag === option.value" @click="tag = tag === option.value ? null : option.value">
          <span :class="`tag tag-${option.color}`">{{ option.label }}</span>
        </button>
      </fieldset>
      <p v-if="validation" class="inline-error" role="alert">{{ validation }}</p>
      <p v-if="error" class="inline-error" role="alert">{{ error }}</p>
      <div class="form-actions">
        <button class="button button-primary" type="submit" :disabled="busy">{{ busy ? "正在保存…" : "保存记录" }}</button>
      </div>
    </form>
  </section>
</template>
