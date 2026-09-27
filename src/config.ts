import type {
    SiteConfig,
    ProfileConfig,
    LicenseConfig,
} from "./types/config"
import type { FriendLink } from "./types/friend"
import type { I18nConfig } from "./types/i18n"

export const siteConfig: SiteConfig = {
    title: "zgzlcc", // Title of the site, used in the tab in the browser and in SEO
    subTitle: "记录生活", // Subtitle of the site
    rootSiteUrl: "https://zgzlcc.github.io", // Public site URL

    favicon: "/favicon/favicon.ico", // Path of the favicon, relative to the /public directory

    pageSize: 5, // Number of posts per page
    homePhotos: ["/home/IMG_1229.webp", "/home/IMG_1645.webp", "/home/IMG_2061.webp", "/home/IMG_2182.webp", "/home/IMG_2688.webp", "/home/IMG_1508.webp", "/home/IMG_1515.webp", "/home/IMG_1703.webp", "/home/IMG_1766.webp", "/home/IMG_1854.webp", "/home/IMG_1910.webp",
    "/home/IMG_3168.webp",
    "/home/IMG_3335.webp",
    "/home/IMG_3430.webp",
    "/home/IMG_3519.webp", "/home/IMG_5661.webp", "/home/IMG_6121.webp", "/home/IMG_3130.webp", "/home/IMG_8518.webp", "/home/IMG_8736.webp", "/home/IMG_8937.webp", "/home/IMG_2371.webp"], // 首页背景照片；在 CMS 中导入并保存后，每次进入首页随机展示一张
    homePhotosMobile: [], // 移动端首页背景照片；留空时沿用首页照片
    toc: {
        enable: true,
        depth: 3 // Max depth of the table of contents, between 1 and 4
    },
    blogNavi: {
        enable: true // Whether to enable blog navigation in the blog footer
    },
    theme: {
        AOS: true, // Whether to enable AOS (Animate On Scroll) for animations
        LQIP: true, // Whether to enable LQIP (Low-Quality Image Placeholder) for image placeholders
        PhotoSwipe: true, // Whether to enable PhotoSwipe for image viewer
        imageCollage: {
            enable: true, // Whether to automatically arrange consecutive images into a grid (collage)
            maxColumns: 2 // Max images per row in a collage (2 - 6); the actual number is chosen automatically
        },
        postCard: {
            imageMode: "top" // Cover image mode for article cards: "top" shows the image above the content; "background" uses the image as the card background, fading to transparent from right to left
        }
    },
    expressiveCode: {
        enable: true, // Whether to enable Expressive Code for code blocks; when false, code blocks fall back to plain text without highlighting (same in the CMS preview)
        theme: "one-dark-pro" // Shiki theme of code blocks, e.g. "one-dark-pro", "github-dark", "vitesse-dark"; one theme is used for both light and dark mode
    }
}

export const profileConfig: ProfileConfig = {
    avatar: "assets/Motues.jpg", // Relative to the /src directory. Relative to the /public directory if it starts with '/'
    name: "zgzlcc", // Used in the footer of the blog
    description: "Life is colorful!", // Used in SEO
    indexPage: "https://github.com/ZGZLCC", // The homepage, used in footer and SEO
    startYear: 2024, // The year the site was created, used in the footer
}

export const licenseConfig: LicenseConfig = {
	enable: false, // Whether to enable license information
	name: "CC BY-NC-SA 4.0", // License name
	url: "https://creativecommons.org/licenses/by-nc-sa/4.0/", // License URL
};

export const i18nConfig: I18nConfig = {
    defaultLanguage: "zh-cn", // Default language of the site
    supportedLanguages: ["zh-cn"], // Local gallery uses Chinese only
    translations: { // Translation content for each supported language
        "zh-cn": {
            Cover: {
                title: {
                    home: "追光者的相册",
                    archive: "相册归档",
                    about: "关于",
                    friends: "友链",
                },
                subTitle: {
                    home: "镜头下的生活",
                    archive: "共 {count} 个相册", // {count} will be replaced with the total number of albums
                    about: "作者的故事",
                    friends: "有趣的灵魂",
                }
            }
        }
    }
};

export const friendLinkConfig: FriendLink[] = [
    {
        name: 'Motues', // Name of the friend link
        avatar: 'https://www.motues.top/avatar.jpg', // Avatar image of the friend link
        url: 'https://www.motues.top', // URL of the friend link
        description: 'Like River!' // Description of the friend link, set to an empty string if not needed
    },
    {
        name: 'Astro',
        avatar: 'https://avatars.githubusercontent.com/u/44914786',
        url: 'https://astro.build',
        description: 'Build fast websites, faster.'
    }
    // Add more friend links here
]
