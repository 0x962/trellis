import type { Decorator } from "@storybook/react-vite";

export const pageFrame: Decorator = (Story) => (
	<div className="flex h-full min-h-0 flex-col">
		<Story />
	</div>
);
