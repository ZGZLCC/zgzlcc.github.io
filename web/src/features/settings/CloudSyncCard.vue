<script setup lang="ts">
import { computed, ref } from "vue";
import { sync, syncStateLabel } from "../../api";
import { formatBeijingTime } from "../../time";

const endpoint = ref(sync.settings.value.endpoint);
const token = ref(sync.settings.value.token);
const saved = ref(false);

const statusLabel = computed(() => syncStateLabel(sync.state.value, sync.lastSyncedAt.value));
const lastSynced = computed(() =>
  sync.lastSyncedAt.value === null ? "" : `上次同步 ${formatBeijingTime(sync.lastSyncedAt.value)}`,
);
const isSyncing = computed(() => sync.state.value === "syncing");
const configured = computed(() => sync.configured);
const syncMessage = computed(() => sync.message.value);

function saveConfig() {
  sync.updateSettings({ endpoint: endpoint.value.trim(), token: token.value.trim() });
  saved.value = true;
  window.setTimeout(() => {
    saved.value = false;
  }, 2500);
}

function run(action: "sync" | "push" | "pull") {
  if (action === "sync") void sync.sync();
  else if (action === "push") void sync.push();
  else void sync.pull();
}
</script>

<template>
  <section class="panel settings-card" aria-labelledby="cloud-title">
    <h3 id="cloud-title">云端同步</h3>
    <p>
      填写自建 Cloudflare Worker 的地址与访问口令后，记录会在本地保存的同时同步到云端，换浏览器或换设备填入同一份配置即可拉回全部记录。
      口令只保存在本机，不会写入导出的备份文件。
    </p>
    <div class="field-stack">
      <label class="field">
        <span>Worker 地址</span>
        <input v-model="endpoint" type="url" placeholder="https://time-sync.你的账号.workers.dev" spellcheck="false" autocomplete="off" />
      </label>
      <label class="field">
        <span>访问口令</span>
        <input v-model="token" type="password" placeholder="与 Worker 的 SYNC_TOKEN 一致" spellcheck="false" autocomplete="off" />
      </label>
    </div>
    <div class="backup-actions">
      <button class="button button-secondary" type="button" :disabled="isSyncing" @click="saveConfig">{{ saved ? "已保存" : "保存配置" }}</button>
      <button class="button button-secondary" type="button" :disabled="isSyncing || !configured" @click="run('sync')">立即同步</button>
      <button class="button button-secondary" type="button" :disabled="isSyncing || !configured" @click="run('push')">上传本地记录</button>
      <button class="button button-secondary" type="button" :disabled="isSyncing || !configured" @click="run('pull')">从云端恢复</button>
    </div>
    <p class="folder-message" role="status">
      {{ statusLabel }}<span v-if="lastSynced"> · {{ lastSynced }}</span>
    </p>
    <p v-if="syncMessage" class="folder-message status-error" role="alert">{{ syncMessage }}</p>
  </section>
</template>
