type Theme = {
	name: string;
	type?: string;
	colors?: Readonly<Record<string, string>>;
};

type ThemeDescriptor = {
	name: string;
	load: () => Promise<Theme>;
};

const descriptors: ThemeDescriptor[] = [
	{ name: "pierre-light", load: async () => (await import("@pierre/theme/pierre-light")).default },
	{ name: "pierre-dark", load: async () => (await import("@pierre/theme/pierre-dark")).default },
];

const collection = (themes: ThemeDescriptor[]) => ({
	getTheme: (name: string) => themes.find((theme) => theme.name === name),
	getThemes: () => themes,
});

export const pierreThemes = collection(descriptors);
export const shikiThemes = collection([]);
export const themes = pierreThemes;
export const createTheme = (theme: ThemeDescriptor) => theme;
