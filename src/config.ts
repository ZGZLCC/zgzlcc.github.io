import type {
    SiteConfig,
    ProfileConfig
} from "./types/config"

export const siteConfig: SiteConfig = {
    title: "Motues",
    subTitle: "记录生活",

    backgroundImage: {
        enabled: false,
        url: "assets/background.png", // Relative to the /src directory. Relative to the /public directory if it starts with '/'
        color: "#f7f7ff"
    },

    favicon: "/favicon/favicon.ico" // Path of the favicon, relative to the /public directory
}

export const profileConfig: ProfileConfig = {
    avatar: "assets/Motues.jpg",
    // avatar: "https://github.com/Motues.png",
    name: "Motues",
    description: "Like River!",
    introPage: "https://motues.top",
    links: [
        // Visit https://icones.js.org/ for icon codes
        // You will need to install the corresponding icon set if it's not already included
        // `pnpm add @iconify-json/<icon-set-name>`
        {
          name: "Blog",
          url: "https://github.motues.top",
          icon: "fa6-solid:book",
          color: "#b6a476",
        },
        {
            name: "Minecraft",
            url: "https://mc.motues.top",
            icon: "vscode-icons:file-type-minecraft",
            color: "",
        },
        {
            name: "GitHub",
            url: "https://github.com/Motues",
            icon: "fa6-brands:github",
            color: "#000000",
        },
        {
            name: "Netease",
            url: "https://music.163.com/#/user/home?id=1601379853",
            icon: "simple-icons:neteasecloudmusic",
            color: "#ff2822",
        }
    ]
}