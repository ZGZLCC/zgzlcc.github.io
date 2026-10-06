<script setup lang="ts">
import { ref } from "vue";
import type { WeekView } from "../../api";
import { downloadBlob } from "../../api";
import { messageOf } from "../../core/errors";
import { renderWeekImageFile } from "./week-image";

const props = defineProps<{ week: WeekView }>();
const exporting = ref(false);
const message = ref("");
const hasError = ref(false);

async function exportImage() {
  if (exporting.value) return;
  exporting.value = true;
  message.value = "";
  try {
    const { blob, fileName } = await renderWeekImageFile(props.week);
    downloadBlob(blob, fileName);
    hasError.value = false;
    message.value = `已导出 ${fileName}，文件保存在浏览器下载目录。`;
  } catch (error) {
    hasError.value = true;
    message.value = messageOf(error, "导出图片失败。");
  } finally {
    exporting.value = false;
  }
}
</script>

<template>
  <div class="week-export">
    <h3>导出周记录图片</h3>
    <p class="week-export-hint">图片包含所选周七天时间表与本周分类时长，名称为 Time_起始日期_结束日期.png。</p>
    <div class="backup-actions">
      <button class="button button-primary" type="button" :disabled="exporting" @click="exportImage">{{ exporting ? "正在导出…" : "导出图片" }}</button>
    </div>
    <p v-if="message" :class="['folder-message', { 'status-error': hasError }]" :role="hasError ? 'alert' : 'status'">{{ message }}</p>
  </div>
</template>
