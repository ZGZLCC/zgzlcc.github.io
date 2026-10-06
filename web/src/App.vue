<script setup lang="ts">
import { ref } from "vue";
import type { TimeEntry } from "./api";
import RecordsPage from "./features/records/RecordsPage.vue";
import WeekPage from "./features/week/WeekPage.vue";
import SettingsPage from "./features/settings/SettingsPage.vue";
import BackupReminder from "./components/BackupReminder.vue";

const views = ["records", "week", "settings"] as const;
type View = (typeof views)[number];

const iconPath = resolveIconPath();
const view = ref<View>(readView());
const weekEditEntry = ref<TimeEntry | null>(null);

/** 相对入口解析图标地址，保证部署在子目录时也能加载。 */
function resolveIconPath(): string {
  try {
    return new URL("icon.svg", document.baseURI).href;
  } catch {
    return "icon.svg";
  }
}

function readView(): View {
  const hash = window.location.hash.replace("#", "");
  return (views as readonly string[]).includes(hash) ? (hash as View) : "records";
}

function show(next: View) {
  view.value = next;
  window.location.hash = next;
}

function editFromWeek(entry: TimeEntry) {
  weekEditEntry.value = entry;
  show("records");
}

function clearWeekEditEntry() {
  weekEditEntry.value = null;
}

window.addEventListener("hashchange", () => {
  view.value = readView();
});
</script>

<template>
  <main class="app-shell">
    <header class="app-header">
      <div class="brand-mark" aria-hidden="true"><img :src="iconPath" alt="" /></div>
      <div class="brand-copy">
        <p class="eyebrow">PERSONAL TIME LOG</p>
        <h1>时间记录</h1>
      </div>
      <nav class="app-nav" aria-label="主导航">
        <button :class="['app-nav-button', { active: view === 'records' }]" type="button" :aria-current="view === 'records' ? 'page' : undefined" @click="show('records')">记录</button>
        <button :class="['app-nav-button', { active: view === 'week' }]" type="button" :aria-current="view === 'week' ? 'page' : undefined" @click="show('week')">周视图</button>
        <button :class="['app-nav-button', { active: view === 'settings' }]" type="button" :aria-current="view === 'settings' ? 'page' : undefined" @click="show('settings')">设置</button>
      </nav>
    </header>

    <KeepAlive>
      <RecordsPage
        v-if="view === 'records'"
        :edit-entry="weekEditEntry"
        @consume-edit="clearWeekEditEntry"
      />
      <WeekPage v-else-if="view === 'week'" @edit="editFromWeek" @open-records="show('records')" />
      <SettingsPage v-else />
    </KeepAlive>

    <BackupReminder v-if="view === 'records'" @open-settings="show('settings')" />
  </main>
</template>
