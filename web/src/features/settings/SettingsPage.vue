<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { BACKUP_EXTENSION, JSON_MIME, downloadBlob, listEntries, readTextFile } from "../../api";
import { messageOf } from "../../core/errors";
import { backupFileName, buildBackup, parseBackup } from "../../storage/transfer";
import { lastExportedAt, markExported } from "../../storage/backup-reminder";
import { repository, emitLocalDataChanged } from "../../storage";
import { formatBeijingTime } from "../../time";
import { setTheme, theme, type Theme } from "../../theme";
import CloudSyncCard from "./CloudSyncCard.vue";

const entryCount = ref<number | null>(null);
const pendingCount = ref(0);
const createdAt = ref<number | null>(null);
const storageStatus = ref("");
const transferStatus = ref("");
const transferFailed = ref(false);
const busy = ref<"export" | "import" | "wipe" | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const confirmDialog = ref<HTMLDialogElement | null>(null);
const wipeDialog = ref<HTMLDialogElement | null>(null);
const wipeDialogOpen = ref(false);
const pendingImport = ref<{ name: string; text: string } | null>(null);
const themes: { value: Theme; label: string }[] = [
  { value: "system", label: "跟随系统" },
  { value: "light", label: "亮色" },
  { value: "dark", label: "暗色" },
];

const overview = computed(() => {
  if (entryCount.value === null) return "正在读取本地数据…";
  const created = createdAt.value === null ? "" : `，创建于 ${formatBeijingTime(createdAt.value)}`;
  return `已完成 ${entryCount.value} 条，待补全 ${pendingCount.value} 条${created}`;
});

/** 上次导出时间；记录只存在浏览器里时它是唯一的线下副本凭据。 */
const lastBackup = computed(() =>
  lastExportedAt.value === null
    ? "还没有导出过备份"
    : `上次导出备份：${formatBeijingTime(lastExportedAt.value)}`,
);

onMounted(refreshOverview);

async function refreshOverview() {
  try {
    const entries = await listEntries();
    entryCount.value = entries.filter((entry) => entry.state === "completed").length;
    pendingCount.value = entries.length - entryCount.value;
    createdAt.value = await repository.createdAt();
    storageStatus.value = "";
  } catch (error) {
    storageStatus.value = messageOf(error, "读取本地数据失败。");
  }
}

async function exportBackup() {
  if (busy.value) return;
  busy.value = "export";
  transferStatus.value = "";
  try {
    const entries = await listEntries();
    const backup = buildBackup(entries, await repository.createdAt());
    if (entries.length === 0) throw new Error("当前没有记录可导出");
    const now = Date.now();
    downloadBlob(new Blob([JSON.stringify(backup, null, 2)], { type: JSON_MIME }), backupFileName(now));
    markExported(now);
    transferFailed.value = false;
    transferStatus.value = `已导出 ${entries.length} 条记录，文件保存在浏览器下载目录。`;
  } catch (error) {
    transferFailed.value = true;
    transferStatus.value = messageOf(error, "导出备份失败。");
  } finally {
    busy.value = null;
  }
}

async function chooseBackupFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  try {
    pendingImport.value = { name: file.name, text: await readTextFile(file) };
    if (pendingImport.value.text.length > 50_000_000) throw new Error("备份文件过大，请确认文件是否正确");
    // 确认框由 v-if 控制，必须等它渲染出来才能调用 showModal。
    await nextTick();
    confirmDialog.value?.showModal();
  } catch (error) {
    pendingImport.value = null;
    transferFailed.value = true;
    transferStatus.value = messageOf(error, "读取备份文件失败。");
  }
}

function cancelImport() {
  pendingImport.value = null;
  confirmDialog.value?.close();
}

async function applyImport() {
  const pending = pendingImport.value;
  if (!pending || busy.value) return;
  busy.value = "import";
  try {
    const entries = parseBackup(pending.text);
    await repository.replaceAll(entries);
    emitLocalDataChanged();
    await refreshOverview();
    transferFailed.value = false;
    transferStatus.value = `已从 ${pending.name} 恢复 ${entries.length} 条记录。`;
    cancelImport();
  } catch (error) {
    transferFailed.value = true;
    transferStatus.value = messageOf(error, "恢复备份失败。");
    confirmDialog.value?.close();
    pendingImport.value = null;
  } finally {
    busy.value = null;
  }
}

/** 先弹项目自己的确认框，而不是浏览器默认的 confirm。 */
async function requestWipe() {
  if (busy.value) return;
  wipeDialogOpen.value = true;
  await nextTick();
  wipeDialog.value?.showModal();
}

function cancelWipe() {
  if (busy.value) return;
  wipeDialogOpen.value = false;
  wipeDialog.value?.close();
}

async function wipeAll() {
  if (busy.value) return;
  busy.value = "wipe";
  try {
    await repository.wipe();
    emitLocalDataChanged();
    await refreshOverview();
    transferFailed.value = false;
    transferStatus.value = "已清空全部记录。";
    cancelWipe();
  } catch (error) {
    transferFailed.value = true;
    transferStatus.value = messageOf(error, "清空记录失败。");
    cancelWipe();
  } finally {
    busy.value = null;
  }
}

function chooseTheme(value: Theme) {
  try {
    setTheme(value);
    storageStatus.value = "";
  } catch {
    storageStatus.value = "无法保存主题设置，请检查浏览器是否禁用了本地存储。";
  }
}
</script>

<template>
  <div class="settings-page">
    <div class="settings-heading">
      <p class="eyebrow">应用偏好</p>
      <h2>设置</h2>
    </div>

    <CloudSyncCard />

    <section class="panel settings-card" aria-labelledby="backup-title">
      <h3 id="backup-title">备份与恢复</h3>
      <p>导出会下载一个包含全部记录的 JSON 文件；恢复会用备份内容整体替换当前记录，浏览器清理站点数据后记录无法找回，建议定期导出。</p>
      <div class="backup-actions">
        <button class="button button-secondary" type="button" :disabled="!!busy" @click="exportBackup">{{ busy === "export" ? "正在导出…" : "导出备份" }}</button>
        <button class="button button-secondary" type="button" :disabled="!!busy" @click="fileInput?.click()">{{ busy === "import" ? "正在恢复…" : "从文件恢复" }}</button>
        <button class="button button-secondary" type="button" :disabled="!!busy" @click="requestWipe">{{ busy === "wipe" ? "正在清空…" : "清空记录" }}</button>
      </div>
      <input ref="fileInput" class="sr-only" type="file" :accept="`${BACKUP_EXTENSION},${JSON_MIME}`" aria-label="选择备份文件" @change="chooseBackupFile" />
      <p v-if="transferStatus" :class="['folder-message', { 'status-error': transferFailed }]" :role="transferFailed ? 'alert' : 'status'">{{ transferStatus }}</p>
    </section>

    <section class="panel settings-card" aria-labelledby="storage-title">
      <h3 id="storage-title">本地数据</h3>
      <p>记录保存在当前浏览器的 IndexedDB 中；未配置云端同步或同步不通时，它就是唯一一份，换浏览器或清理站点数据前请先导出备份。</p>
      <p class="folder-message" role="status">{{ overview }}</p>
      <p class="folder-message" role="status">{{ lastBackup }}</p>
      <p v-if="storageStatus" class="folder-message status-error" role="alert">{{ storageStatus }}</p>
    </section>

    <section class="panel settings-card" aria-labelledby="theme-title">
      <h3 id="theme-title">修改主题</h3>
      <p>跟随系统会在系统外观变化时自动切换。</p>
      <div class="theme-options" role="group" aria-label="应用主题">
        <button v-for="option in themes" :key="option.value" class="button theme-option" :class="{ selected: theme === option.value }" type="button" :aria-pressed="theme === option.value" @click="chooseTheme(option.value)">{{ option.label }}</button>
      </div>
    </section>

    <dialog v-if="pendingImport" ref="confirmDialog" class="delete-dialog" aria-labelledby="import-title" @cancel.prevent="cancelImport">
      <h2 id="import-title">恢复备份</h2>
      <p>将用 {{ pendingImport.name }} 替换当前全部记录，现有记录会被覆盖。确定继续吗？</p>
      <div class="delete-actions">
        <button class="button button-primary" type="button" :disabled="busy === 'import'" @click="applyImport">确定恢复</button>
        <button class="button button-quiet" type="button" :disabled="busy === 'import'" @click="cancelImport">取消</button>
      </div>
    </dialog>

    <dialog v-if="wipeDialogOpen" ref="wipeDialog" class="delete-dialog" aria-labelledby="wipe-title" @cancel.prevent="cancelWipe">
      <h2 id="wipe-title">清空记录</h2>
      <p>确定清空全部记录吗？此操作无法撤销，建议先导出备份。</p>
      <div class="delete-actions">
        <button class="button button-danger-quiet" type="button" :disabled="busy === 'wipe'" @click="wipeAll">
          {{ busy === "wipe" ? "正在清空…" : "清空记录" }}
        </button>
        <button class="button button-quiet" type="button" :disabled="busy === 'wipe'" @click="cancelWipe">取消</button>
      </div>
    </dialog>
  </div>
</template>
