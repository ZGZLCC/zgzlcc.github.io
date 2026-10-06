<script setup lang="ts">
import { computed, nextTick, onActivated, onUnmounted, ref } from "vue";
import { listEntries, sync } from "../api";
import { isStale, lastExportedAt } from "../storage/backup-reminder";
import { onLocalDataChanged } from "../storage";
import { formatBeijingTime } from "../time";

const emit = defineEmits<{ openSettings: [] }>();

const dialog = ref<HTMLDialogElement | null>(null);
const open = ref(false);
const entryCount = ref(0);
/** 本次会话是否已经弹过；保存为会话级，重新打开页面会重新判断。 */
const lastPrompt = ref("");

const exportedText = computed(() =>
  lastExportedAt.value === null ? "还没有导出过备份" : `上次导出 ${formatBeijingTime(lastExportedAt.value)}`,
);
const syncedText = computed(() =>
  sync.lastSyncedAt.value === null ? "还没有成功同步过" : `上次同步 ${formatBeijingTime(sync.lastSyncedAt.value)}`,
);

function readDismissed(): boolean {
  try {
    const value = localStorage.getItem("timeweb-backup-dismissed");
    return value !== null && Date.now() - Number(value) < 86_400_000;
  } catch {
    return false;
  }
}

/**
 * 距上次同步或上次导出超过 7 天才提醒；未配置云端同步时只看导出时间。
 * 没有记录或今天已忽略时都不弹，每次会话只弹一次。
 */
async function check() {
  if (open.value || readDismissed()) return;
  const entries = await listEntries().catch(() => []);
  entryCount.value = entries.length;
  if (entries.length === 0) return;
  const now = Date.now();
  const syncStale = sync.configured && isStale(sync.lastSyncedAt.value, now);
  if (!syncStale && !isStale(lastExportedAt.value, now)) return;
  if (lastPrompt.value !== "") return;
  lastPrompt.value = new Date(now).toDateString();
  open.value = true;
  await nextTick();
  dialog.value?.showModal();
}

function dismiss() {
  try {
    localStorage.setItem("timeweb-backup-dismissed", String(Date.now()));
  } catch {
    // 记不住也没关系，下次打开再提醒一次。
  }
  close();
}

function goToSettings() {
  emit("openSettings");
  close();
}

function close() {
  open.value = false;
  dialog.value?.close();
}

onActivated(check);
// 新增记录或导入后重新判断：挂载时可能还没有记录。
const stopWatching = onLocalDataChanged(() => void check());
onUnmounted(stopWatching);
</script>

<template>
  <dialog v-if="open" ref="dialog" class="delete-dialog" aria-labelledby="remind-title" @cancel.prevent="dismiss">
    <h2 id="remind-title">该做一次备份了</h2>
    <p>
      已有 {{ entryCount }} 条记录，{{ exportedText }}，{{ syncedText }}。
      记录目前只存在这台浏览器里，清理站点数据就会全部丢失。
    </p>
    <div class="delete-actions">
      <button class="button button-primary" type="button" @click="goToSettings">去设置页导出</button>
      <button class="button button-quiet" type="button" @click="dismiss">明天再说</button>
    </div>
  </dialog>
</template>
