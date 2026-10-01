import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { DesktopSettings } from "../../features/settings/DesktopSettings";
import type { DesktopSettingsBridge } from "../../lib/desktopBridge";
import { failure, pending } from "./fixtures";
import { clickButton } from "./interactions";

const status = { packaged: true, dataDirectory: "/storybook/Trellis", openAtLogin: false };
const bridge: DesktopSettingsBridge = {
	status: async () => status,
	run: async () => {},
	setOpenAtLogin: async () => {},
};
const meta = { title: "Overlays/DesktopSettings", component: DesktopSettings, args: { bridge } } satisfies Meta<
	typeof DesktopSettings
>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Ready: Story = {};
export const Selected: Story = {
	args: { bridge: { ...bridge, status: async () => ({ ...status, openAtLogin: true }) } },
};
export const Disabled: Story = {
	args: { bridge: { ...bridge, status: async () => ({ ...status, packaged: false }) } },
};
export const Loading: Story = { args: { bridge: { ...bridge, status: pending } } };
export const RequestError: Story = { args: { bridge: { ...bridge, status: async () => failure() } } };
export const ActionPending: Story = {
	args: { bridge: { ...bridge, run: pending } },
	play: clickButton("Choose data directory"),
};
export const ActionError: Story = {
	args: { bridge: { ...bridge, run: async () => failure() } },
	play: clickButton("Choose data directory"),
};
export const LoginPending: Story = {
	args: { bridge: { ...bridge, setOpenAtLogin: pending } },
	play: async ({ canvasElement }) => {
		await userEvent.click(
			await within(canvasElement.ownerDocument.body).findByRole("switch", { name: "Open Trellis at login" }),
		);
	},
};
