import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { MoveSessionProjectDialog } from "../../features/sessions/MoveSessionProjectDialog";
import { SessionActionsMenu } from "../../features/sessions/SessionActionsMenu";
import { SwitchAccountDialog } from "../../features/sessions/SwitchAccountDialog";
import { OverlayTrigger } from "./components/OverlayTrigger";
import { accounts, failure, noop, pending, projects, responses, run, session } from "./fixtures";
import { clickButton } from "./interactions";
import { checkAccountNames } from "./SessionControls/checkAccountNames";

const meta = {
	title: "Overlays/SessionControls",
	component: SessionActionsMenu,
	args: { session, run, onRename: noop, onSessionDetails: noop },
	parameters: {
		trellis: {
			responses: {
				...responses,
				"sessions.move": session,
				"agentRuns.switchAccount": { ...run, accountId: accounts[1]!.id },
				"agentRuns.setPinned": { id: run.id, pinnedAt: null },
				"sessions.setArchived": session,
			},
		},
	},
} satisfies Meta<typeof SessionActionsMenu>;
export default meta;
type Story = StoryObj<typeof meta>;
const narrow = { viewport: { value: "narrow", isRotated: false } };
const response = (method: string, value: unknown) => ({ trellis: { responses: { [method]: value } } });
export const ClosedTrigger: Story = {};
export const Open: Story = { play: clickButton("Actions for Catalog session") };
export const Disabled: Story = {
	args: { deleteDisabled: true },
	play: async (context) => {
		await Open.play!(context);
		const page = within(context.canvasElement.ownerDocument.body);
		await expect(await page.findByRole("menuitem", { name: "Archive" })).toHaveAttribute("aria-disabled", "true");
		await expect(page.getByRole("menuitem", { name: "Move to project…" })).toHaveAttribute("aria-disabled", "true");
	},
};
export const Pinned: Story = {
	args: { run: { ...run, pinnedAt: "2026-09-30T12:00:00.000Z" } },
	play: clickButton("Actions for Catalog session"),
};
export const Archived: Story = {
	args: { session: { ...session, archivedAt: "2026-09-30T12:00:00.000Z" } },
	play: clickButton("Actions for Catalog session"),
};
export const MoveOpen: Story = {
	render: () => (
		<OverlayTrigger label="Move session">
			{(close) => (
				<MoveSessionProjectDialog
					session={session}
					open
					onOpenChange={(open) => {
						if (!open) close();
					}}
				/>
			)}
		</OverlayTrigger>
	),
};
export const MoveLoading: Story = { ...MoveOpen, parameters: { trellis: { responses: { "projects.list": pending } } } };
export const MoveEmpty: Story = { ...MoveOpen, parameters: { trellis: { responses: { "projects.list": [] } } } };
export const MoveError: Story = {
	...MoveOpen,
	parameters: { trellis: { responses: { "sessions.move": failure } } },
	play: async ({ canvasElement }) => {
		await userEvent.click(await within(canvasElement.ownerDocument.body).findByRole("option", { name: /DEMO/ }));
	},
};
export const AccountOpen: Story = {
	render: () => (
		<OverlayTrigger label="Choose account">
			{(close) => <SwitchAccountDialog run={run} onClose={close} />}
		</OverlayTrigger>
	),
};
export const AccountEmpty: Story = {
	...AccountOpen,
	parameters: { trellis: { responses: { "harnessAccounts.list": [] } } },
};
export const AccountLoading: Story = {
	...AccountOpen,
	parameters: { trellis: { responses: { "harnessAccounts.list": pending } } },
};
export const AccountError: Story = {
	...AccountOpen,
	parameters: { trellis: { responses: { "harnessAccounts.list": failure } } },
};
export const AccountSelected: Story = {
	...AccountOpen,
	play: async ({ canvasElement }) => {
		await userEvent.click((await within(canvasElement.ownerDocument.body).findAllByRole("option"))[1]!);
	},
};
export const AccountPending: Story = {
	...AccountSelected,
	parameters: { trellis: { responses: { "agentRuns.switchAccount": pending } } },
	play: async (context) => {
		await AccountSelected.play!(context);
		await clickButton("Switch account")(context);
		const page = within(context.canvasElement.ownerDocument.body);
		await expect(page.getByRole("button", { name: "Cancel" })).toBeDisabled();
		await userEvent.keyboard("{Escape}");
		await waitFor(() => expect(page.getByRole("dialog", { name: "Switch to Team?" })).toBeVisible());
	},
};
export const AccountSwitchError: Story = {
	...AccountSelected,
	parameters: { trellis: { responses: { "agentRuns.switchAccount": failure } } },
	play: async (context) => {
		await AccountSelected.play!(context);
		await clickButton("Switch account")(context);
		const page = within(context.canvasElement.ownerDocument.body);
		await waitFor(() => expect(page.getByText("The account did not switch")).toBeVisible());
		await expect(page.getByRole("button", { name: "Retry switch" })).toBeEnabled();
	},
};
let projectLoads = 0;
export const MoveLoadRecovery: Story = {
	...MoveOpen,
	beforeEach: () => {
		projectLoads = 0;
	},
	parameters: {
		trellis: {
			responses: {
				"projects.list": () => {
					if (++projectLoads === 1) return failure();
					return projects;
				},
			},
		},
	},
	play: async ({ canvasElement }) => {
		const page = within(canvasElement.ownerDocument.body);
		await expect(await page.findByText("Projects did not load")).toBeVisible();
		await userEvent.click(page.getByRole("button", { name: "Retry" }));
		await expect(await page.findByRole("option", { name: /DEMO/ })).toBeVisible();
	},
};
let moveRequest = Promise.withResolvers<typeof session>();
let moveInputs: unknown[] = [];
export const MovePendingRecovery: Story = {
	...MoveOpen,
	beforeEach: () => {
		moveInputs = [];
		moveRequest = Promise.withResolvers<typeof session>();
	},
	parameters: {
		trellis: {
			responses: {
				"sessions.move": (input: unknown) => {
					moveInputs.push(input);
					return moveInputs.length === 1 ? moveRequest.promise : { ...session, projectId: projects[0]!.id };
				},
			},
		},
	},
	play: async ({ canvasElement }) => {
		const page = within(canvasElement.ownerDocument.body);
		await userEvent.click(await page.findByRole("option", { name: /DEMO/ }));
		await expect(await within(page.getByRole("dialog")).findByRole("status")).toHaveTextContent("DEMO");
		await userEvent.keyboard("{Escape}");
		await expect(page.getByRole("dialog", { name: "Move Catalog session to project" })).toBeVisible();
		await expect(
			page.getByRole("combobox", { name: "Search projects", hidden: true }).closest("[inert]"),
		).not.toBeNull();
		await expect(moveInputs).toHaveLength(1);
		moveRequest.reject(new Error("The synthetic move failed."));
		await expect(await page.findByText("The session did not move")).toBeVisible();
		await expect(page.getByText(/Selected project:.*DEMO/)).toBeVisible();
		await userEvent.click(page.getByRole("button", { name: "Retry move" }));
		await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
		await expect(moveInputs).toHaveLength(2);
		await expect(moveInputs[1]).toEqual(moveInputs[0]);
	},
};
export const MovePendingRecoveryNarrow: Story = { ...MovePendingRecovery, globals: narrow };
export const AccountNames: Story = {
	...AccountOpen,
	play: checkAccountNames,
};
export const AccountNamesNarrow: Story = { ...AccountNames, globals: narrow };
let accountLoads = 0;
export const AccountLoadRecovery: Story = {
	...AccountOpen,
	beforeEach: () => {
		accountLoads = 0;
	},
	parameters: {
		trellis: {
			responses: {
				"harnessAccounts.list": () => {
					if (++accountLoads === 1) return failure();
					return accounts;
				},
			},
		},
	},
	play: async ({ canvasElement }) => {
		const page = within(canvasElement.ownerDocument.body);
		await waitFor(() => expect(page.getByText("Accounts did not load")).toBeVisible());
		const dialog = page.getByRole("dialog", { name: "Switch account" });
		await waitFor(() => expect(dialog.contains(canvasElement.ownerDocument.activeElement)).toBe(true));
		const retry = page.getByRole("button", { name: "Retry" });
		retry.focus();
		await expect(retry).toHaveFocus();
		await userEvent.keyboard("{Enter}");
		await waitFor(() => expect(page.getByRole("option", { name: /Team/ })).toBeVisible());
		await expect(accountLoads).toBe(2);
	},
};
let switchInputs: { accountId: string; expectedTerminalId: string; requestId: string }[] = [];
export const AccountRetry: Story = {
	...AccountSelected,
	beforeEach: () => {
		switchInputs = [];
	},
	parameters: {
		trellis: {
			responses: {
				"agentRuns.switchAccount": (input: (typeof switchInputs)[number]) => {
					switchInputs.push(input);
					if (switchInputs.length === 1) return failure();
					return { ...run, accountId: accounts[1]!.id };
				},
			},
		},
	},
	play: async (context) => {
		await AccountSelected.play!(context);
		await clickButton("Switch account")(context);
		const page = within(context.canvasElement.ownerDocument.body);
		await waitFor(() => expect(page.getByText("The account did not switch")).toBeVisible());
		await expect(page.getByRole("dialog", { name: "Switch to Team?" })).toBeVisible();
		const retry = page.getByRole("button", { name: "Retry switch" });
		retry.focus();
		await userEvent.keyboard("{Enter}");
		await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
		await expect(switchInputs).toHaveLength(2);
		await expect(switchInputs[1]).toEqual(switchInputs[0]);
		await expect(switchInputs[0]).toMatchObject({ accountId: accounts[1]!.id, expectedTerminalId: run.terminalId });
		await expect(switchInputs[0]!.requestId).toMatch(/^[0-9a-f-]{36}$/);
	},
};
export const AccountRetryNarrow: Story = { ...AccountRetry, globals: narrow };
export const ArchivedDisabled: Story = {
	...Archived,
	args: { ...Archived.args, deleteDisabled: true },
	play: async (context) => {
		await Open.play!(context);
		await expect(
			await within(context.canvasElement.ownerDocument.body).findByRole("menuitem", { name: "Unarchive" }),
		).toHaveAttribute("aria-disabled", "true");
	},
};
export const ArchivePending: Story = {
	parameters: { trellis: { responses: { "sessions.setArchived": pending } } },
	play: async (context) => {
		await Open.play!(context);
		const page = within(context.canvasElement.ownerDocument.body);
		await userEvent.click(await page.findByRole("menuitem", { name: "Archive" }));
		await clickButton("Actions for Catalog session")(context);
		await expect(await page.findByRole("menuitem", { name: "Archive" })).toHaveAttribute("aria-disabled", "true");
		await expect(page.getByRole("menuitem", { name: "Move to project…" })).toHaveAttribute("aria-disabled", "true");
	},
};
export const AccountLongNameNarrow: Story = {
	...AccountNamesNarrow,
	parameters: response("harnessAccounts.list", [
		{ ...accounts[0]!, name: "Primary account for the product engineering team and customer operations" },
		accounts[1]!,
	]),
};
