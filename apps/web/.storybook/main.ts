import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
	stories: ["../src/stories/**/*.stories.@(ts|tsx)"],
	addons: ["@storybook/addon-docs", "@storybook/addon-a11y"],
	framework: {
		name: "@storybook/react-vite",
		options: { builder: { viteConfigPath: ".storybook/vite.config.ts" } },
	},
	core: { disableTelemetry: true },
	typescript: { reactDocgen: "react-docgen" },
};

export default config;
