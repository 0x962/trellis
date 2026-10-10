import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { SwitchAccountDialog } from "../../features/sessions/SwitchAccountDialog";
import { OverlayTrigger } from "./components/OverlayTrigger";
import { accounts, failure, responses, run } from "./fixtures";

const created = { ...accounts[0]!, id: "01M00000000000000000000999", name: "New work" };
const meta = {
	title: "Overlays/AccountCreation",
	component: SwitchAccountDialog,
	args: { run, onClose: () => {} },
	parameters: {
		trellis: { responses: { ...responses, "harnessAccounts.create": created } },
	},
	render: (args) => (
		<OverlayTrigger label="Choose account">
			{(close) => <SwitchAccountDialog {...args} onClose={close} />}
		</OverlayTrigger>
	),
} satisfies Meta<typeof SwitchAccountDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Create: Story = {
	play: async ({ canvasElement }) => {
		const page = within(canvasElement.ownerDocument.body);
		await userEvent.type(await page.findByRole("combobox", { name: "Search accounts" }), "New work");
		await userEvent.click(await page.findByRole("option", { name: 'Create account "New work"' }));
		const form = within(await page.findByRole("dialog", { name: "Add agent account" }));
		await expect(form.getByRole("textbox", { name: "Account name" })).toHaveValue("New work");
		await expect(form.getByRole("combobox", { name: "Account harness" })).toBeDisabled();
		await userEvent.click(form.getByRole("button", { name: "Add account" }));
		await waitFor(() => expect(page.getByRole("dialog", { name: "Switch to New work?" })).toBeVisible());
		await expect(page.getByRole("button", { name: "Switch account" })).toBeEnabled();
	},
};
export const Cancel: Story = {
	play: async ({ canvasElement }) => {
		const page = within(canvasElement.ownerDocument.body);
		await userEvent.type(await page.findByRole("combobox", { name: "Search accounts" }), "New work");
		await userEvent.click(await page.findByRole("option", { name: 'Create account "New work"' }));
		const form = within(await page.findByRole("dialog", { name: "Add agent account" }));
		await userEvent.click(form.getByRole("button", { name: "Cancel" }));
		await expect(await page.findByRole("dialog", { name: "Switch account" })).toBeVisible();
		await expect(page.getByRole("combobox", { name: "Search accounts" })).toHaveValue("New work");
	},
};
export const Refused: Story = {
	parameters: { trellis: { responses: { "harnessAccounts.create": failure } } },
	play: async ({ canvasElement }) => {
		const page = within(canvasElement.ownerDocument.body);
		await userEvent.type(await page.findByRole("combobox", { name: "Search accounts" }), "New work");
		await userEvent.click(await page.findByRole("option", { name: 'Create account "New work"' }));
		const form = within(await page.findByRole("dialog", { name: "Add agent account" }));
		await userEvent.click(form.getByRole("button", { name: "Add account" }));
		await expect(await form.findByRole("alert")).toBeVisible();
		await expect(form.getByRole("textbox", { name: "Account name" })).toHaveValue("New work");
	},
};
