import { ref } from "vue";

export type Theme = "system" | "light" | "dark";

const key = "timeweb-theme";
const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

function savedTheme(): Theme {
  try {
    const value = localStorage.getItem(key);
    if (value === "light" || value === "dark") return value;
  } catch { /* Storage may be unavailable; keep the system default. */ }
  return "system";
}

export const theme = ref<Theme>(savedTheme());

function applyTheme() {
  document.documentElement.dataset.theme = theme.value === "system"
    ? (systemDark.matches ? "dark" : "light")
    : theme.value;
}

systemDark.addListener(applyTheme);
applyTheme();

export function setTheme(value: Theme) {
  localStorage.setItem(key, value);
  theme.value = value;
  applyTheme();
}
