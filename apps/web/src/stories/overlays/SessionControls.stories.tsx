import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { MoveSessionProjectDialog } from "../../features/sessions/MoveSessionProjectDialog";
import { SessionActionsMenu } from "../../features/sessions/SessionActionsMenu";
import { SwitchAccountDialog } from "../../features/sessions/SwitchAccountDialog";
import { accounts, failure, noop, pending, responses, run, session } from "./fixtures";
import { clickButton } from "./interactions";

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
export const ClosedTrigger: Story = {};
export const Open: Story = { play: clickButton("Actions for Catalog session") };
export const Disabled: Story = { args: { deleteDisabled: true }, play: clickButton("Actions for Catalog session") };
export const Pinned: Story = {
	args: { run: { ...run, pinnedAt: "2026-09-30T12:00:00.000Z" } },
	play: clickButton("Actions for Catalog session"),
};
export const Archived: Story = {
	args: { session: { ...session, archivedAt: "2026-09-30T12:00:00.000Z" } },
	play: clickButton("Actions for Catalog session"),
};
export const MoveOpen: Story = {
	render: () => <MoveSessionProjectDialog session={session} open onOpenChange={noop} />,
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
export const AccountOpen: Story = { render: () => <SwitchAccountDialog run={run} onClose={noop} /> };
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
	},
};
export const AccountSwitchError: Story = {
	...AccountPending,
	parameters: { trellis: { responses: { "agentRuns.switchAccount": failure } } },
};
