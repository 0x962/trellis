import type { Meta, StoryObj } from "@storybook/react-vite";
import type { UsageAccount, UsageGroupRow } from "@trellis/api";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { UsageAccounts } from "../../features/usage/UsagePage/components/UsageAccounts/UsageAccounts";
import { unavailableUsageAccounts } from "../../features/usage/UsagePage/components/UsageAccounts/unavailableUsageAccounts";
import { accounts, failure, pending, responses } from "./fixtures";
import { clickButton, fillField } from "./interactions";

const configured = accounts.map((account) => ({
	...account,
	loginCommand: `claude --profile ${account.profilePath} login`,
}));
const usageAccounts: UsageAccount[] = unavailableUsageAccounts(configured).map((account, index) =>
	index === 0
		? {
				...account,
				quota: {
					...account.quota,
					status: "ok",
					email: "avery@example.test",
					plan: "Team",
					windows: [
						{
							id: "five-hour",
							label: "Five-hour window",
							usedPercent: 28,
							resetsAt: "2026-10-07T10:00:00.000Z",
						},
						{
							id: "weekly",
							label: "Weekly window",
							usedPercent: 82,
							resetsAt: "2026-10-12T10:00:00.000Z",
						},
					],
				},
			}
		: account,
);
const usageRows: UsageGroupRow[] = usageAccounts.map((account, index) => ({
	key: account.key,
	label: account.name,
	detail: null,
	href: null,
	harness: account.harness,
	usd: index === 0 ? 18.5 : 0,
	tokens: index === 0 ? 240_000 : 0,
	sessions: index === 0 ? 3 : 0,
	runs: index === 0 ? 3 : 0,
	approximate: false,
	days: [],
}));

const denseConfigured = Array.from({ length: 40 }, (_, index) => ({
	...configured[index % configured.length]!,
	id: `synthetic-account-${index + 1}`,
	name:
		index === 0
			? "Production catalog account with a deliberately long name"
			: `Synthetic account ${String(index + 1).padStart(2, "0")}`,
	profilePath: `/tmp/trellis-synthetic/account-${index + 1}`,
	isDefault: index === 0,
	loginCommand: `synthetic-login --account ${index + 1}`,
}));
const denseUsageAccounts = unavailableUsageAccounts(denseConfigured);
const denseUsageRows: UsageGroupRow[] = denseUsageAccounts.map((account, index) => ({
	key: account.key,
	label: account.name,
	detail: null,
	href: null,
	harness: account.harness,
	usd: index + 1,
	tokens: (index + 1) * 12_000,
	sessions: index + 1,
	runs: index + 1,
	approximate: false,
	days: [],
}));

const meta = {
	title: "Overlays/UsageAccounts",
	component: UsageAccounts,
	args: { rows: usageRows, metric: "usd", total: 18.5, pending: false },
	parameters: {
		trellis: {
			responses: {
				...responses,
				"harnessAccounts.list": configured,
				"usage.accounts": usageAccounts,
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
export const QuotaAndUsage: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText(/Claude Code · Weekly window · 82% used · Resets/)).toBeVisible();
		await expect(canvas.getByText("$18.50", { exact: true })).toBeVisible();
	},
};
export const MeasuredZero: Story = {
	args: { rows: [], total: 0 },
	play: async ({ canvasElement }) => {
		await expect((await within(canvasElement).findAllByText("$0", { exact: true })).length).toBeGreaterThan(0);
	},
};
export const ReportUnavailable: Story = {
	args: { reportAvailable: false },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect((await canvas.findAllByText("Not available", { exact: true })).length).toBeGreaterThan(0);
		await expect(canvas.queryByText("$18.50", { exact: true })).not.toBeInTheDocument();
	},
};
export const DenseLongContent: Story = {
	args: { rows: denseUsageRows, total: 820 },
	parameters: {
		trellis: {
			responses: { "harnessAccounts.list": denseConfigured, "usage.accounts": denseUsageAccounts },
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByText("Production catalog account with a deliberately long name")).toBeVisible();
		await expect(canvas.getByText("Default", { exact: true })).toBeVisible();
		await expect(canvas.getByRole("heading", { name: "Accounts (40)" })).toBeVisible();
	},
};
export const SearchIdentity: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.type(canvas.getByRole("searchbox", { name: "Search accounts" }), "avery@example.test");
		await expect(await canvas.findByText("Primary", { exact: true })).toBeVisible();
		await expect(canvas.getByText("Default", { exact: true })).toBeVisible();
		await expect(canvas.queryByText("Team")).not.toBeInTheDocument();
		await expect(canvas.getByRole("heading", { name: "Accounts (1)" })).toBeVisible();
	},
};
export const SearchNoResults: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.type(canvas.getByRole("searchbox", { name: "Search accounts" }), "not-a-real-account");
		await expect(await canvas.findByRole("heading", { name: "No accounts match" })).toBeVisible();
		await expect(canvas.getByText("No accounts match “not-a-real-account”. Change the search text.")).toBeVisible();
		await expect(canvas.getByRole("heading", { name: "Accounts (0)" })).toBeVisible();
	},
};
export const DenseSearch: Story = {
	args: { rows: denseUsageRows, total: 820 },
	parameters: {
		trellis: {
			responses: { "harnessAccounts.list": denseConfigured, "usage.accounts": denseUsageAccounts },
		},
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const search = canvas.getByRole("searchbox", { name: "Search accounts" });
		await userEvent.type(search, "Synthetic account 40");
		await expect(await canvas.findByText("Synthetic account 40")).toBeVisible();
		await expect(canvas.getByRole("heading", { name: "Accounts (1)" })).toBeVisible();
		await userEvent.clear(search);
		await expect(canvas.getByRole("heading", { name: "Accounts (40)" })).toBeVisible();
		await expect(await canvas.findByText("Production catalog account with a deliberately long name")).toBeVisible();
		await expect(canvas.getByText("Default", { exact: true })).toBeVisible();
	},
};
export const MenuOpen: Story = { play: menu };
export const AddOpen: Story = { play: clickButton("Add account") };
export const AddPending: Story = {
	parameters: { trellis: { responses: { "harnessAccounts.create": pending } } },
	play: add,
};
export const AddError: Story = {
	parameters: { trellis: { responses: { "harnessAccounts.create": failure } } },
	play: async (context) => {
		await add(context);
		const body = within(context.canvasElement.ownerDocument.body);
		await waitFor(() => expect(body.getByRole("alert")).toBeVisible());
		await expect(body.getByRole("textbox", { name: "Account name" })).toHaveValue("Catalog account");
	},
};
export const AddSuccess: Story = { play: add };
export const RenameOpen: Story = { play: choose("Rename") };
export const RenamePending: Story = {
	parameters: { trellis: { responses: { "harnessAccounts.update": pending } } },
	play: rename,
};
export const RenameError: Story = {
	parameters: { trellis: { responses: { "harnessAccounts.update": failure } } },
	play: async (context) => {
		await rename(context);
		const body = within(context.canvasElement.ownerDocument.body);
		await waitFor(() => expect(body.getByRole("alert")).toBeVisible());
		await expect(body.getByRole("textbox", { name: "Account name" })).toHaveValue("Catalog account");
	},
};
export const RemoveOpen: Story = { play: choose("Remove") };
export const RemovePending: Story = {
	parameters: { trellis: { responses: { "harnessAccounts.remove": pending } } },
	play: remove,
};
export const RemoveError: Story = {
	parameters: { trellis: { responses: { "harnessAccounts.remove": failure } } },
	play: async (context) => {
		await remove(context);
		await waitFor(() => expect(within(context.canvasElement.ownerDocument.body).getByRole("alert")).toBeVisible());
	},
};
export const DetailsOpen: Story = { play: choose("Edit details") };
export const SignInOpen: Story = { play: choose("Sign in") };
export const Empty: Story = {
	parameters: { trellis: { responses: { "harnessAccounts.list": [], "usage.accounts": [] } } },
};
export const Loading: Story = { parameters: { trellis: { responses: { "usage.accounts": pending } } } };
export const RequestError: Story = {
	parameters: { trellis: { responses: { "usage.accounts": failure } } },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByRole("heading", { name: "Trellis cannot read the account quotas" })).toBeVisible();
		await expect(canvas.getByText("Primary", { exact: true })).toBeVisible();
		await expect(canvas.getByText("Default", { exact: true })).toBeVisible();
	},
};
