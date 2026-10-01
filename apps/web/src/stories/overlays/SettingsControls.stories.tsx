import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { MenuLinks } from "../../features/settings/MenuLinks";
import { NotificationSettings } from "../../features/settings/NotificationSettings";
import { ThemeField } from "../../features/settings/ThemeField";
import { settings, settingsResponses } from "../pages/fixtures/settings";
import { failure, pending } from "./fixtures";
import { clickButton } from "./interactions";

const saved = {
	...settings,
	menuLinks: [{ id: "catalog", label: "Documentation", url: "https://example.test/docs", icon: "BookOpen" }],
};
const meta = {
	title: "Overlays/SettingsControls",
	component: MenuLinks,
	parameters: {
		trellis: {
			responses: { ...settingsResponses, "settings.get": saved, "settings.set": { ...saved, menuLinks: [] } },
		},
	},
} satisfies Meta<typeof MenuLinks>;
export default meta;
type Story = StoryObj<typeof meta>;
const remove = async (context: { canvasElement: HTMLElement }) => {
	await clickButton("Actions for Documentation")(context);
	await userEvent.click(
		await within(context.canvasElement.ownerDocument.body).findByRole("menuitem", { name: "Delete" }),
	);
};
const select =
	(name: string) =>
	async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		await userEvent.click(await within(canvasElement.ownerDocument.body).findByRole("combobox", { name }));
	};
export const MenuLinksClosed: Story = {};
export const MenuLinksOpen: Story = { play: clickButton("Actions for Documentation") };
export const MenuLinksEmpty: Story = {
	parameters: { trellis: { responses: { "settings.get": { ...saved, menuLinks: [] } } } },
};
export const MenuLinksPending: Story = {
	parameters: { trellis: { responses: { "settings.set": pending } } },
	play: remove,
};
export const MenuLinksError: Story = {
	parameters: { trellis: { responses: { "settings.set": failure } } },
	play: remove,
};
export const MenuLinksSuccess: Story = { play: remove };
export const ThemeClosed: Story = { render: () => <ThemeField /> };
export const ThemeOpen: Story = { ...ThemeClosed, play: select("Theme") };
export const NotificationsClosed: Story = { render: () => <NotificationSettings /> };
export const NotificationsOpen: Story = { ...NotificationsClosed, play: select("Notification volume") };
