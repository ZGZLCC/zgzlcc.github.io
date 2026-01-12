import type {
    SiteConfig,
    ProfileConfig,
    LabConfig
} from "./types/config"

export const siteConfig: SiteConfig = {
    title: "Chan",
    subTitle: "Chen",

    backgroundImage: {
        enabled: false, // 如果未启用背景图像，则这将用作背景颜色
        url: "assets/background.png", // 相对于 /src 目录。如果以 '/' 开头则相对于 /public 目录
    },

    favicon: "/favicon/favicon.ico" // favicon 的路径，相对于 /public 目录
}

export const profileConfig: ProfileConfig = {
    avatar: "assets/zgzlcc.png", // 相对于 /src 目录。如果以 '/' 开头则相对于 /public 目录
    name: "ZGZLCC",
    description: "",
    introPage: "https://zgzlcc.github.io",
    links: [
        /* -------------------------------- 图标 -------------------------------- */
        // 访问 https://icones.js.org/ 获取图标代码
        // 如果尚未包含相应的图标集，您需要安装它
        // `pnpm add @iconify-json/<icon-set-name>`
        // 然后在 astro.config.mjs 的 defineConfig.integrationsin.icon 中添加图标
        // 您也可以使用以 .svg 结尾的本地 svg 图标，相对于 src 目录
        // 例如 `icon: "assets/icons/github.svg"`
        /* -------------------------------- 颜色 -------------------------------- */
        // 颜色最好在明亮和黑暗环境中都能清晰可见
        // 如果未设置颜色，将使用图标的默认颜色
        {
          name: "miniprogram",
          url: "https://zgzlcc.github.io/miniprogram",
          icon: "fa6-solid:heart", 
          color: "#db0f0fff",
        },
        // {
        //     name: "Note",
        //     url: "https://note.motues.top",
        //     icon: "fa6-solid:book",
        //     color: "#b4a992",
        // },
        // {
        //     name: "Lab",
        //     url: "/lab",
        //     icon: "fa6-solid:server",
        //     color: "#72b6b3",
        // },
        {
            name: "GitHub",
            url: "https://github.com/ZGZLCC",
            icon: "fa6-brands:github",
            color: "#888",
        },
        // {
        //     name: "Netease",
        //     url: "https://music.163.com/#/user/home?id=1601379853",
        //     icon: "simple-icons:neteasecloudmusic",
        //     color: "#ff2822",
        // },
        // {
        //     name: "Mail",
        //     url: "mailto:me@motues.top",
        //     icon: "fa6-solid:envelope",
        //     color: "#43a4d1ff"
        // },
    ]
}

export const labConfig : LabConfig = [
    // 图标和颜色规则与 profileConfig 相同
    {
        name: "BlockBoard",
        description: "A real-time online block board",
        url: "https://blockboard.motues.top",
        icon: "svg-spinners:blocks-wave", 
        color: "#9fa1a1ff"
    },
    {
        name: "Server",
        description: "A server monitor",
        url: "https://server.motues.top",
        icon: "svg-spinners:bars-scale",
        color: "#50b8e9ff"
    },
    {
        name: "OpenList",
        description: "A storage service",
        url: "https://openlist.motues.top",
        icon: "assets/icons/openlist.svg",
    }
]