import type { Preview } from "@storybook/react-vite";
import { AppStory, loadStoryApp, resetStoryState } from "../src/stories/support";
import "../src/stories/support/networkBoundary";
import "../src/app.css";
import "@trellis/ui/review.css";
import { Documentation } from "./Documentation";

const preview: Preview = {
	tags: ["autodocs"],
	globalTypes: {
		theme: {
			description: "Application theme",
			toolbar: {
				icon: "circlehollow",
				items: ["light", "dark"],
				dynamicTitle: true,
			},
		},
	},
	initialGlobals: { theme: "dark" },
	loaders: [async (context) => ({ app: await loadStoryApp(context.parameters.trellis) })],
	parameters: {
		layout: "fullscreen",
		controls: { expanded: true },
		docs: { page: Documentation },
		a11y: { test: "todo" },
		options: { storySort: { order: ["Welcome", "Components", "Overlays", "Pages"] } },
		viewport: {
			options: {
				phone: { name: "Phone", styles: { width: "390px", height: "844px" } },
				narrow: { name: "Narrow phone", styles: { width: "320px", height: "720px" } },
				tablet: { name: "Tablet", styles: { width: "768px", height: "1024px" } },
				desktop: { name: "Desktop", styles: { width: "1440px", height: "900px" } },
			},
		},
	},
	beforeEach: async (context) => {
		const viewport = context.globals.viewport;
		const styles = context.parameters.viewport.options[viewport?.value ?? "desktop"].styles;
		const width = Number.parseInt(styles.width, 10);
		const height = Number.parseInt(styles.height, 10);
		await (
			window as Window & {
				__trellisStoryViewport?: (size: { width: number; height: number }) => Promise<void>;
			}
		).__trellisStoryViewport?.(viewport?.isRotated ? { width: height, height: width } : { width, height });
		resetStoryState(context.parameters.trellis?.actor);
	},
	decorators: [
		(Story, context) => (
			<AppStory
				key={context.id}
				parameters={context.parameters.trellis}
				theme={context.globals.theme}
				loaded={context.loaded.app}
			>
				<Story />
			</AppStory>
		),
	],
};

export default preview;
