<script setup lang="ts">
defineProps<{ date: string; resetLabel?: string; disabled?: boolean }>();
const emit = defineEmits<{ "update:date": [date: string]; reset: [] }>();

function pickDate(event: Event) {
  emit("update:date", (event.target as HTMLInputElement).value);
}
</script>

<template>
  <div class="date-jump">
    <label class="date-jump-field">
      <span>跳转日期</span>
      <input :value="date" type="date" required :disabled="disabled" @change="pickDate" />
    </label>
    <button v-if="resetLabel" class="button button-quiet date-jump-reset" type="button" :disabled="disabled" @click="emit('reset')">
      {{ resetLabel }}
    </button>
  </div>
</template>
