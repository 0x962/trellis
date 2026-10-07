import type { Meta, StoryObj } from "@storybook/react-vite";
import { useArgs } from "storybook/preview-api";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { SettingsView } from "../../features/settings/SettingsView";
import { failure, pending } from "./fixtures/project";
import { SettingsJourneyView } from "./fixtures/SettingsJourneyView";
import { settings, settingsResponses } from "./fixtures/settings";
import { settingsJourney } from "./fixtures/settingsJourney";
import { pageFrame } from "./pageFrame";

const meta = {
	decorators: [pageFrame],
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
export const SwitchSections: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const navigation = within(canvas.getByRole("navigation", { name: "Settings" }));
		for (const name of ["Clean up", "Agent prompt", "Menu links", "Notifications", "Account"]) {
			await userEvent.click(navigation.getByRole("button", { name }));
			await expect(await canvas.findByRole("heading", { name })).toBeVisible();
			await expect(navigation.getByRole("button", { name })).toHaveAttribute("aria-current", "page");
		}
	},
};
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

const accountJourney = settingsJourney();
export const AccountSaveAndReturn: Story = {
	render: (args) => <SettingsJourneyView {...args} />,
	beforeEach: () => accountJourney.reset(),
	parameters: { trellis: { responses: accountJourney.responses } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const field = await canvas.findByRole("textbox", { name: "Your name" });
		await userEvent.clear(field);
		await userEvent.type(field, "Alex Morgan");
		const release = accountJourney.holdNextSave();
		await userEvent.tab();
		await waitFor(() => expect(field).toBeDisabled());
		await userEvent.click(field);
		await expect(accountJourney.requests).toHaveLength(1);
		await expect(accountJourney.writes).toHaveLength(0);
		release();
		await waitFor(() => expect(accountJourney.writes.at(-1)?.defaultActorName).toBe("Alex Morgan"));
		const nav = within(canvas.getByRole("navigation", { name: "Settings" }));
		await userEvent.click(nav.getByRole("button", { name: "Notifications" }));
		await userEvent.click(nav.getByRole("button", { name: "Account" }));
		await expect(await canvas.findByRole("textbox", { name: "Your name" })).toHaveValue("Alex Morgan");
	},
};

const retryJourney = settingsJourney(1);
export const AccountSaveRetry: Story = {
	render: (args) => <SettingsJourneyView {...args} />,
	beforeEach: () => retryJourney.reset(),
	parameters: { trellis: { responses: retryJourney.responses, toaster: true } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const body = within(canvasElement.ownerDocument.body);
		const field = await canvas.findByRole("textbox", { name: "Your name" });
		await userEvent.clear(field);
		await userEvent.type(field, "Alex Morgan");
		await userEvent.tab();
		await expect(await body.findByText("The settings did not save.")).toBeVisible();
		await userEvent.click(await body.findByRole("button", { name: "Retry" }));
		await waitFor(() => expect(retryJourney.writes.at(-1)?.defaultActorName).toBe("Alex Morgan"));
		await waitFor(() => expect(field).toHaveValue("Alex Morgan"));
	},
};

const cleanupJourney = settingsJourney();
export const CleanupSaveAndReturn: Story = {
	render: (args) => <SettingsJourneyView {...args} />,
	args: { section: "cleanup" },
	beforeEach: () => cleanupJourney.reset(),
	parameters: { trellis: { responses: cleanupJourney.responses } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const field = await canvas.findByRole("spinbutton", { name: "Auto archive sessions after days without activity" });
		await userEvent.clear(field);
		await userEvent.type(field, "12");
		await userEvent.tab();
		await waitFor(() => expect(cleanupJourney.writes.at(-1)?.sessionCleanup?.archiveAfterDays).toBe(12));
		const nav = within(canvas.getByRole("navigation", { name: "Settings" }));
		await userEvent.click(nav.getByRole("button", { name: "Account" }));
		await userEvent.click(nav.getByRole("button", { name: "Clean up" }));
		await expect(
			await canvas.findByRole("spinbutton", { name: "Auto archive sessions after days without activity" }),
		).toHaveValue(12);
		await expect(
			await canvas.findByRole("spinbutton", { name: "Auto delete sessions after days without activity" }),
		).toHaveValue(7);
	},
};

const notificationsJourney = settingsJourney();
export const NotificationSaveAndReturn: Story = {
	render: (args) => <SettingsJourneyView {...args} />,
	args: { section: "notifications" },
	beforeEach: () => notificationsJourney.reset(),
	parameters: { trellis: { responses: notificationsJourney.responses } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(await canvas.findByRole("switch", { name: "Notification sounds" }));
		await waitFor(() => expect(notificationsJourney.writes.at(-1)?.notifications?.sound).toBe(false));
		const nav = within(canvas.getByRole("navigation", { name: "Settings" }));
		await userEvent.click(nav.getByRole("button", { name: "Account" }));
		await userEvent.click(nav.getByRole("button", { name: "Notifications" }));
		await expect(await canvas.findByRole("switch", { name: "Notification sounds" })).not.toBeChecked();
		await expect(canvas.getByRole("combobox", { name: "Notification volume" })).toHaveTextContent("50%");
	},
};

const menuJourney = settingsJourney();
export const MenuLinkSaveAndReturn: Story = {
	render: (args) => <SettingsJourneyView {...args} />,
	args: { section: "menu-links" },
	beforeEach: () => menuJourney.reset(),
	parameters: { trellis: { responses: menuJourney.responses } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(await canvas.findByRole("button", { name: "Add menu link" }));
		await userEvent.type(await canvas.findByRole("textbox", { name: "Label" }), "Release guide");
		await userEvent.type(canvas.getByRole("textbox", { name: "HTTPS URL" }), "https://example.com/releases");
		await userEvent.click(canvas.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(menuJourney.writes.at(-1)?.menuLinks).toHaveLength(2));
		const nav = within(canvas.getByRole("navigation", { name: "Settings" }));
		await userEvent.click(nav.getByRole("button", { name: "Account" }));
		await userEvent.click(nav.getByRole("button", { name: "Menu links" }));
		await expect(await canvas.findByText("Release guide", { exact: true })).toBeVisible();
		await expect(canvas.getByText("Project reference", { exact: true })).toBeVisible();
	},
};

const promptJourney = settingsJourney();
export const PromptSaveAndReturn: Story = {
	render: (args) => <SettingsJourneyView {...args} />,
	args: { section: "agent-prompt" },
	beforeEach: () => promptJourney.reset(),
	parameters: { trellis: { responses: promptJourney.responses } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const field = await canvas.findByRole("textbox", { name: "Prompt template" });
		await userEvent.clear(field);
		await userEvent.type(field, "Read the task and record the result.");
		await userEvent.click(canvas.getByRole("button", { name: "Save prompt" }));
		await expect(await canvas.findByText("Saved. The next harness start uses this prompt.")).toBeVisible();
		const nav = within(canvas.getByRole("navigation", { name: "Settings" }));
		await userEvent.click(nav.getByRole("button", { name: "Account" }));
		await userEvent.click(nav.getByRole("button", { name: "Agent prompt" }));
		await waitFor(() =>
			expect(canvas.getByRole("textbox", { name: "Prompt template" })).toHaveTextContent(
				"Read the task and record the result.",
			),
		);
		await expect(canvas.getByText("Custom template")).toBeVisible();
	},
};
