import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import {
	UsageAccounts,
	unavailableUsageAccounts,
} from "../../features/usage/UsagePage/components/UsageAccounts/UsageAccounts";
import { accounts, failure, pending, responses } from "./fixtures";
import { clickButton, fillField } from "./interactions";

const configured = accounts.map((account) => ({
	...account,
	loginCommand: `claude --profile ${account.profilePath} login`,
}));
const meta = {
	title: "Overlays/UsageAccounts",
	component: UsageAccounts,
	args: { rows: [], metric: "usd", total: 0, pending: false },
	parameters: {
		trellis: {
			responses: {
				...responses,
				"harnessAccounts.list": configured,
				"usage.accounts": unavailableUsageAccounts(configured),
				"harnessAccounts.create": configured[0],
				"harnessAccounts.update": configured[0],
				"harnessAccounts.remove": { removed: true },
			},
		},
	},
} satisfies Meta<typeof UsageAccounts>;
export default meta;
type Story = StoryObj<typeof meta>;
const menu = clickButton("Actions for Primary");
const choose = (name: string) => async (context: { canvasElement: HTMLElement }) => {
	await menu(context);
	await userEvent.click(await within(context.canvasElement.ownerDocument.body).findByRole("menuitem", { name }));
};
const add = async (context: { canvasElement: HTMLElement }) => {
	await clickButton("Add account")(context);
	await fillField(context.canvasElement, "Account name", "Catalog account");
	const dialog = await within(context.canvasElement.ownerDocument.body).findByRole("dialog");
	await userEvent.click(within(dialog).getByRole("button", { name: "Add account" }));
};
const rename = async (context: { canvasElement: HTMLElement }) => {
	await choose("Rename")(context);
	await fillField(context.canvasElement, "Account name", "Catalog account");
	await clickButton("Rename account")(context);
};
const remove = async (context: { canvasElement: HTMLElement }) => {
	await choose("Remove")(context);
	await clickButton("Remove account")(context);
};
export const ClosedTrigger: Story = {};
export const MenuOpen: Story = { play: menu };
export const AddOpen: Story = { play: clickButton("Add account") };
export const AddPending: Story = {
	parameters: { trellis: { responses: { "harnessAccounts.create": pending } } },
	play: add,
};
export const AddError: Story = {
	parameters: { trellis: { responses: { "harnessAccounts.create": failure } } },
	play: add,
};
export const AddSuccess: Story = { play: add };
export const RenameOpen: Story = { play: choose("Rename") };
export const RenamePending: Story = {
	parameters: { trellis: { responses: { "harnessAccounts.update": pending } } },
	play: rename,
};
export const RenameError: Story = {
	parameters: { trellis: { responses: { "harnessAccounts.update": failure } } },
	play: rename,
};
export const RemoveOpen: Story = { play: choose("Remove") };
export const RemovePending: Story = {
	parameters: { trellis: { responses: { "harnessAccounts.remove": pending } } },
	play: remove,
};
export const RemoveError: Story = {
	parameters: { trellis: { responses: { "harnessAccounts.remove": failure } } },
	play: remove,
};
export const DetailsOpen: Story = { play: choose("Edit details") };
export const SignInOpen: Story = { play: choose("Sign in") };
export const Empty: Story = {
	parameters: { trellis: { responses: { "harnessAccounts.list": [], "usage.accounts": [] } } },
};
export const Loading: Story = { parameters: { trellis: { responses: { "usage.accounts": pending } } } };
export const RequestError: Story = { parameters: { trellis: { responses: { "usage.accounts": failure } } } };
