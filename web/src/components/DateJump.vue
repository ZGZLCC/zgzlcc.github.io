<script setup lang="ts">
import DatePicker from "./DatePicker.vue";

defineProps<{ date: string; resetLabel?: string; disabled?: boolean }>();
const emit = defineEmits<{ "update:date": [date: string]; reset: [] }>();
</script>

<template>
  <div class="date-jump">
    <label class="date-jump-field">
      <span>跳转日期</span>
      <DatePicker dense :date="date" label="跳转日期" :disabled="disabled" @update:date="emit('update:date', $event)" />
    </label>
    <button v-if="resetLabel" class="button button-quiet date-jump-reset" type="button" :disabled="disabled" @click="emit('reset')">
      {{ resetLabel }}
    </button>
  </div>
</template>
