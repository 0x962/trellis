import type { Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import { SettingsView } from "../../features/settings/SettingsView";
import { failure, pending } from "./fixtures/project";
import { settings, settingsResponses } from "./fixtures/settings";

const meta = {
	title: "Pages/Settings",
	component: SettingsView,
	args: { section: "account", onSectionChange: () => {} },
	render: function Render(args) {
		const [, updateArgs] = useArgs();
		return <SettingsView {...args} onSectionChange={(section) => updateArgs({ section })} />;
	},
	parameters: { layout: "fullscreen", trellis: { path: "/settings", responses: settingsResponses } },
} satisfies Meta<typeof SettingsView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Account: Story = {};
export const Notifications: Story = { args: { section: "notifications" } };
export const Cleanup: Story = { args: { section: "cleanup" } };
export const MenuLinks: Story = { args: { section: "menu-links" } };
export const EmptyMenuLinks: Story = {
	args: { section: "menu-links" },
	parameters: { trellis: { responses: { "settings.get": { ...settings, menuLinks: [] } } } },
};
export const AgentPrompt: Story = { args: { section: "agent-prompt" } };
export const PromptLoading: Story = {
	args: { section: "agent-prompt" },
	parameters: { trellis: { responses: { "settings.agentPrompt": pending } } },
};
export const PromptError: Story = {
	args: { section: "agent-prompt" },
	parameters: { trellis: { responses: { "settings.agentPrompt": failure } } },
};
export const CleanupLoading: Story = {
	args: { section: "cleanup" },
	parameters: { trellis: { responses: { "settings.get": pending } } },
};
export const CleanupError: Story = {
	args: { section: "cleanup" },
	parameters: { trellis: { responses: { "settings.get": failure } } },
};
export const Narrow: Story = { globals: { viewport: { value: "phone", isRotated: false } } };
