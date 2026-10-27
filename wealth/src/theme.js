/**
 * 主题：跟随系统 / 浅色 / 深色三选一，默认跟随系统。
 * 选中后记住偏好；index.html 的头部脚本按同一规则在首屏绘制前设好 data-theme。
 */
const KEY = "wealth-theme";
const QUERY = "(prefers-color-scheme: dark)";

/** 存下的偏好只认 light / dark，其余（含没存过）都按跟随系统。 */
function readPreference() {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

/** 偏好换算成实际生效的主题：跟随系统时看系统设置。 */
function resolve(preference) {
  if (preference === "system") return matchMedia(QUERY).matches ? "dark" : "light";
  return preference;
}

export function startTheme() {
  const nav = document.querySelector(".theme-switch");
  if (!nav) return;

  const radios = [...nav.querySelectorAll('input[name="theme"]')];
  const systemQuery = matchMedia(QUERY);

  const paint = (preference) => {
    document.documentElement.dataset.theme = resolve(preference);
    for (const radio of radios) radio.checked = radio.value === preference;
  };

  const choose = (preference, remember) => {
    paint(preference);
    if (!remember) return;
    try {
      localStorage.setItem(KEY, preference);
    } catch {
      // 记不住也不影响这次切换
    }
  };

  nav.addEventListener("change", (event) => {
    if (event.target.name === "theme") choose(event.target.value, true);
  });

  // 跟随系统时，系统在深浅之间切换要立刻反映到页面上
  systemQuery.addEventListener?.("change", () => {
    if (readPreference() === "system") paint("system");
  });

  choose(readPreference(), false);
}
