<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { sync, syncStateLabel } from "../../api";
import { hasBuiltInEndpoint } from "../../storage/remote-settings";
import { formatBeijingTime } from "../../time";

const code = ref(sync.settings.value.code);
const endpoint = ref(sync.settings.value.endpoint);
const saved = ref(false);
const needsEndpoint = !hasBuiltInEndpoint();

const statusLabel = computed(() => syncStateLabel(sync.state.value, sync.lastSyncedAt.value));
const lastSynced = computed(() =>
  sync.lastSyncedAt.value === null ? "" : `上次同步 ${formatBeijingTime(sync.lastSyncedAt.value)}`,
);
const isSyncing = computed(() => sync.state.value === "syncing");
const configured = computed(() => sync.configured);
const syncMessage = computed(() => sync.message.value);

/** 覆盖类操作要先确认：它们会整份替换另一端的数据，和「立即同步」的合并不是一回事。 */
const pending = ref<"push" | "pull" | null>(null);
const overlay = ref<HTMLDialogElement | null>(null);

const overlayCopy = computed(() => {
  if (pending.value === "push") {
    return {
      title: "用本地覆盖云端",
      body: "云端的全部记录会被本机内容替换，云端多出来的记录将被删除。其他设备下次同步时会跟着删除。确定继续吗？",
      confirm: "确定覆盖",
    };
  }
  return {
    title: "用云端覆盖本地",
    body: "本机的全部记录会被云端内容替换，本机多出来的记录将被删除。确定继续吗？",
    confirm: "确定覆盖",
  };
});

function saveConfig() {
  sync.updateSettings({ endpoint: endpoint.value.trim(), code: code.value.trim() });
  saved.value = true;
  window.setTimeout(() => {
    saved.value = false;
  }, 2500);
}

async function request(action: "sync" | "push" | "pull") {
  if (action === "sync") {
    void sync.sync();
    return;
  }
  pending.value = action;
  await nextTick();
  overlay.value?.showModal();
}

function cancelOverlay() {
  if (isSyncing.value) return;
  pending.value = null;
  overlay.value?.close();
}

function confirmOverlay() {
  const action = pending.value;
  overlay.value?.close();
  pending.value = null;
  if (action === "push") void sync.push();
  else if (action === "pull") void sync.pull();
}
</script>

<template>
  <section class="panel settings-card" aria-labelledby="cloud-title">
    <h3 id="cloud-title">云端同步</h3>
    <p>
      填入管理员给你的同步码后，记录会在本地保存的同时同步到云端，换浏览器或换设备填入同一个码即可拉回全部记录。
      一个同步码对应一份独立数据，码只保存在本机，不会写进导出的备份文件。
    </p>
    <div class="field-stack">
      <label v-if="needsEndpoint" class="field">
        <span>同步服务地址</span>
        <input v-model="endpoint" type="url" placeholder="https://time-sync.你的账号.workers.dev" spellcheck="false" autocomplete="off" />
      </label>
      <label class="field">
        <span>同步码</span>
        <input v-model="code" type="text" placeholder="time_ 开头的一串字符" spellcheck="false" autocomplete="off" />
      </label>
    </div>
    <div class="backup-actions">
      <button class="button button-secondary" type="button" :disabled="isSyncing" @click="saveConfig">{{ saved ? "已保存" : "保存配置" }}</button>
      <button class="button button-secondary" type="button" :disabled="isSyncing || !configured" @click="request('sync')">立即同步</button>
      <button class="button button-secondary" type="button" :disabled="isSyncing || !configured" @click="request('push')">上传本地记录</button>
      <button class="button button-secondary" type="button" :disabled="isSyncing || !configured" @click="request('pull')">从云端恢复</button>
    </div>
    <p class="folder-message" role="status">
      {{ statusLabel }}<span v-if="lastSynced"> · {{ lastSynced }}</span>
    </p>
    <p v-if="syncMessage" class="folder-message status-error" role="alert">{{ syncMessage }}</p>

    <dialog ref="overlay" class="delete-dialog" aria-labelledby="overlay-title">
      <h2 id="overlay-title">{{ overlayCopy.title }}</h2>
      <p>{{ overlayCopy.body }}</p>
      <div class="delete-actions">
        <button class="button button-danger-quiet" type="button" :disabled="isSyncing" @click="confirmOverlay">
          {{ isSyncing ? "正在同步…" : overlayCopy.confirm }}
        </button>
        <button class="button button-quiet" type="button" :disabled="isSyncing" @click="cancelOverlay">取消</button>
      </div>
    </dialog>
  </section>
</template>
