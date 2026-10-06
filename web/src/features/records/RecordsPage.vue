<script setup lang="ts">
import { computed, nextTick, onActivated, onUnmounted, ref, watch } from "vue";
import { deleteEntry, listEntries, listPending, saveEntry, startPunch, sync } from "../../api";
import { emitLocalDataChanged, isRemoteApply, onLocalDataChanged } from "../../storage";
import type { SaveEntryInput, TimeEntry } from "../../api";
import { messageOf } from "../../core/errors";
import RecordForm from "./RecordForm.vue";
import RecordList from "./RecordList.vue";

const entries = ref<TimeEntry[]>([]);
const pendingEntries = ref<TimeEntry[]>([]);
const loading = ref(true);
const busy = ref(false);
const formVersion = ref(0);
const editingEntry = ref<TimeEntry | null>(null);
const message = ref("");
const errorScope = ref<"load" | "punch" | "form" | "delete" | null>(null);
const deleteTarget = ref<TimeEntry | null>(null);
const deleteDialog = ref<HTMLDialogElement | null>(null);
const props = defineProps<{ editEntry: TimeEntry | null }>();
const emit = defineEmits<{ consumeEdit: [] }>();

const pending = computed(() => [...pendingEntries.value]
  .sort((left, right) => right.id.localeCompare(left.id)));
const completed = computed(() => entries.value
  .filter((entry) => entry.state === "completed")
  .sort((left, right) => right.startMs! - left.startMs!));

watch(() => props.editEntry, (entry) => {
  if (entry) {
    openEditForm(entry);
    emit("consumeEdit");
  }
}, { immediate: true });

// KeepAlive 下 onActivated 首次显示也会触发，因此不必再用 onMounted。
onActivated(() => {
  void reload();
});

// 设置页导入、清空或云端同步写入后立即刷新，避免停留在旧列表上；
// 本地新增或修改则顺带触发一次同步推送（云端写回时不推，否则会空转一次）。
const stopWatchingData = onLocalDataChanged(() => {
  void reload();
  if (!isRemoteApply) sync.requestPush();
});
onUnmounted(stopWatchingData);

/** 同步写入云端后重新读取，保证界面显示的是合并后的结果。 */
async function reload() {
  try {
    const [allEntries, incompleteEntries] = await Promise.all([listEntries(), listPending()]);
    entries.value = allEntries;
    pendingEntries.value = incompleteEntries;
    errorScope.value = null;
    message.value = "";
  } catch (error: unknown) {
    showError(error, "load");
  } finally {
    loading.value = false;
  }
}

watch(deleteTarget, async (entry) => {
  if (entry) {
    await nextTick();
    deleteDialog.value?.showModal();
  }
});

function showError(error: unknown, scope: "load" | "punch" | "form" | "delete") {
  errorScope.value = scope;
  message.value = messageOf(error);
}

function upsert(entry: TimeEntry) {
  entries.value = [...entries.value.filter((item) => item.id !== entry.id), entry];
  pendingEntries.value = entry.state === "completed"
    ? pendingEntries.value.filter((item) => item.id !== entry.id)
    : [...pendingEntries.value.filter((item) => item.id !== entry.id), entry];
}

async function openEditForm(entry: TimeEntry) {
  message.value = "";
  errorScope.value = null;
  editingEntry.value = entry;
  await nextTick();
  document.querySelector(".form-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetForm() {
  editingEntry.value = null;
  formVersion.value++;
}

async function togglePunch() {
  busy.value = true;
  message.value = "";
  errorScope.value = null;
  let changed = false;
  try {
    upsert(await startPunch());
    changed = true;
  } catch (error: unknown) {
    showError(error, "punch");
  } finally {
    busy.value = false;
  }
  // 只有真正写入成功才广播：失败时广播会立刻刷新界面，把错误提示冲掉。
  if (changed) emitLocalDataChanged();
}

async function saveRecord(input: SaveEntryInput) {
  busy.value = true;
  message.value = "";
  errorScope.value = null;
  let changed = false;
  try {
    upsert(await saveEntry(input));
    resetForm();
    changed = true;
  } catch (error: unknown) {
    showError(error, "form");
  } finally {
    busy.value = false;
  }
  if (changed) emitLocalDataChanged();
}

function requestDelete(entry: TimeEntry) {
  message.value = "";
  errorScope.value = null;
  deleteTarget.value = entry;
}

function cancelDelete() {
  if (!busy.value) deleteTarget.value = null;
}

async function removeRecord() {
  const entry = deleteTarget.value;
  if (!entry) return;
  busy.value = true;
  let changed = false;
  try {
    await deleteEntry(entry.id);
    entries.value = entries.value.filter((item) => item.id !== entry.id);
    pendingEntries.value = pendingEntries.value.filter((item) => item.id !== entry.id);
    deleteTarget.value = null;
    changed = true;
  } catch (error: unknown) {
    showError(error, "delete");
  } finally {
    busy.value = false;
  }
  if (changed) emitLocalDataChanged();
}
</script>

<template>
  <div class="records-page">
    <div class="dashboard-grid">
      <section class="panel punch-panel" aria-labelledby="punch-title">
        <p class="eyebrow">快速记录</p>
        <h2 id="punch-title">开始打卡</h2>
        <button class="button button-primary punch-button" type="button" :disabled="busy || loading" @click="togglePunch">
          {{ busy ? "请稍候…" : "记录当前时间" }}
        </button>
        <p v-if="errorScope === 'punch' || errorScope === 'load'" class="inline-error" role="alert">{{ message }}</p>
      </section>

      <RecordForm
        :key="formVersion"
        :entry="editingEntry"
        :busy="busy || loading"
        :error="errorScope === 'form' ? message : ''"
        @save="saveRecord"
        @cancel="resetForm"
      />

      <RecordList
        :pending="pending"
        :completed="completed"
        :busy="busy || loading"
        @edit="openEditForm"
        @delete="requestDelete"
      />
    </div>

    <dialog v-if="deleteTarget" ref="deleteDialog" class="delete-dialog" aria-labelledby="delete-title" @cancel.prevent="cancelDelete">
      <h2 id="delete-title">删除记录</h2>
      <p>确定删除这条记录吗？此操作无法撤销。</p>
      <p v-if="errorScope === 'delete'" class="inline-error" role="alert">{{ message }}</p>
      <div class="delete-actions">
        <button class="button button-danger-quiet" type="button" :disabled="busy" @click="removeRecord">删除</button>
        <button class="button button-quiet" type="button" :disabled="busy" @click="cancelDelete">取消</button>
      </div>
    </dialog>
  </div>
</template>
