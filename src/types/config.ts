export type SiteConfig = {
    title: string;
    subTitle: string;

    backgroundImage: {
        enabled: boolean;
        url: string;
        colorLigth: string;
        colorDark: string;
    };

    favicon: string;
}

export type ProfileConfig = {
    avatar: string;
    name: string;
    description: string;
    introPage?: string;
    links: {
        name: string;
        url: string;
        icon: string;
        color: string;
    }[];
}