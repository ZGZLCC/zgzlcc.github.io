import type {
    SiteConfig,
    ProfileConfig,
    LabConfig
} from "./types/config"

export const siteConfig: SiteConfig = {
    title: "Motues",
    subTitle: "记录生活",

    backgroundImage: {
        enabled: false, // If backgroundImage is not enabled, this will be used as the background color
        url: "assets/background.png", // Relative to the /src directory. Relative to the /public directory if it starts with '/'
    },

    favicon: "/favicon/favicon.ico" // Path of the favicon, relative to the /public directory
}

export const profileConfig: ProfileConfig = {
    avatar: "assets/Motues.jpg", // Relative to the /src directory. Relative to the /public directory if it starts with '/'
    name: "Motues",
    description: "Like River!",
    introPage: "https://motues.top",
    links: [
        // Visit https://icones.js.org/ for icon codes
        // You will need to install the corresponding icon set if it's not already included
        // `pnpm add @iconify-json/<icon-set-name>`
        // Then add icon to defineConfig.integrationsin.icon in astro.config.mjs
        // The colors a best to be clearly visible in both light and dark environments 
        {
          name: "Blog",
          url: "https://blog.motues.top",
          icon: "fa6-solid:tree",
          color: "#0dbc79", // You can find more colors here: https://zhongguose.com/
        },
        {
            name: "Note",
            url: "https://note.motues.top",
            icon: "fa6-solid:book",
            color: "#b4a992",
        },
        {
            name: "Lab",
            url: "/lab",
            icon: "fa6-solid:server",
            color: "#72b6b3",
        },
        {
            name: "GitHub",
            url: "https://github.com/Motues",
            icon: "fa6-brands:github",
            color: "#888",
        },
        {
            name: "Netease",
            url: "https://music.163.com/#/user/home?id=1601379853",
            icon: "simple-icons:neteasecloudmusic",
            color: "#ff2822",
        },
        {
            name: "Mail",
            url: "mailto:me@motues.top",
            icon: "fa6-solid:envelope",
            color: "#43a4d1ff"
        },
    ]
}

export const labConfig : LabConfig = [
    {
        name: "BlockBoard",
        description: "A real-time online block board",
        url: "https://blockboard.motues.top",
        icon: "svg-spinners:blocks-wave", // Visit https://icones.js.org/ for icon codes
        color: "#9fa1a1ff"
    },
    {
        name: "Server",
        description: "A server monitor",
        url: "https://server.motues.top",
        icon: "svg-spinners:bars-scale",
        color: "#50b8e9ff"
    },
]