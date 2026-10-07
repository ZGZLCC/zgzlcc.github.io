import { createApp } from "vue";
import App from "./App.vue";
import { sync } from "./storage";
import "./style.css";
import "./components/date-jump.css";
import "./components/date-time.css";
import "./features/records/records.css";
import "./features/records/records-layout.css";
import "./features/week/week.css";
import "./features/week/week-grid.css";
import "./features/settings/settings.css";
import "./theme.css";
import "./web.css";

createApp(App).mount("#app");

// 已配置云端同步时静默同步一次；未配置不会发出任何请求。
sync.start();
