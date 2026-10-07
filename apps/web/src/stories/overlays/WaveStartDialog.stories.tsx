import type { Meta, StoryObj } from "@storybook/react-vite";
import type { AgentRunStartInput } from "@trellis/api";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { WaveStartDialog } from "../../features/table/WaveStart/WaveStartDialog";
import { OverlayTrigger } from "./components/OverlayTrigger";
import { failure, noop, pending, responses, run, tickets } from "./fixtures";

const partialFailure = (input: { ticket?: string }) => (input.ticket === "DEMO-2" ? failure() : run);
const retainedCalls: AgentRunStartInput[] = [];
let retainedFailure = true;
const retainedStart = (input: AgentRunStartInput) => {
	retainedCalls.push(structuredClone(input));
	if (input.ticket === "DEMO-2" && retainedFailure) {
		retainedFailure = false;
		return failure();
	}
	return run;
};

import { clickButton } from "./interactions";

const meta = {
	title: "Overlays/WaveStartDialog",
	component: WaveStartDialog,
	args: { open: true, onOpenChange: noop, wave: "First wave", tickets, assigned: new Set<string>() },
	parameters: { trellis: { responses: { ...responses, "agentRuns.start": run } } },
	render: (args, context) => (
		<OverlayTrigger label="Start wave" initiallyOpen={!context.parameters.closed}>
			{(close) => (
				<WaveStartDialog
					{...args}
					onOpenChange={(open) => {
						if (!open) close();
					}}
				/>
			)}
		</OverlayTrigger>
	),
} satisfies Meta<typeof WaveStartDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Open: Story = {};
export const OneReady: Story = { args: { tickets: tickets.slice(0, 1) } };
export const ManyReady: Story = {
	args: {
		tickets: [
			...tickets,
			{ ...tickets[0]!, id: "story-ticket-3", identifier: "DEMO-3", number: 3, title: "Check the phone layout" },
			{ ...tickets[0]!, id: "story-ticket-4", identifier: "DEMO-4", number: 4, title: "Check both themes" },
		],
	},
};
export const ClosedTrigger: Story = { parameters: { closed: true } };
export const Empty: Story = { args: { tickets: [] } };
export const Disabled: Story = { args: { assigned: new Set(tickets.map(({ id }) => id)) } };
export const Waiting: Story = {
	args: {
		tickets: tickets.map((ticket) => ({
			...ticket,
			ready: false,
			waitsOn: [{ identifier: "DEMO-3", title: "Prepare shared fixtures", status: "started" }],
		})),
	},
};
export const Pending: Story = {
	parameters: { trellis: { responses: { "agentRuns.start": pending } } },
	play: clickButton("Start 2 agents"),
};
export const PartialFailure: Story = {
	parameters: { trellis: { responses: { "agentRuns.start": partialFailure } } },
	play: clickButton("Start 2 agents"),
};
export const RetryRetainsRequestAndHarness: Story = {
	parameters: { trellis: { responses: { "agentRuns.start": retainedStart } } },
	play: async ({ canvasElement }) => {
		retainedCalls.length = 0;
		retainedFailure = true;
		const body = within(canvasElement.ownerDocument.body);
		await userEvent.click(await body.findByRole("button", { name: "Choose agent" }));
		const picker = await body.findByRole("dialog", { name: "Choose agent" });
		await userEvent.click(await within(picker).findByRole("combobox", { name: "Harness" }));
		await userEvent.click(await body.findByRole("option", { name: "Codex" }));
		await userEvent.keyboard("{Escape}");
		await waitFor(() => expect(body.queryByRole("dialog", { name: "Choose agent" })).not.toBeInTheDocument());
		await userEvent.click(await body.findByRole("button", { name: "Start 2 agents" }));
		await userEvent.click(await body.findByRole("button", { name: "Retry 1 failed ticket" }));
		await waitFor(() => expect(retainedCalls).toHaveLength(3));
		expect(retainedCalls[0]?.harness?.preset).toBe("codex");
		expect(retainedCalls[2]?.harness?.preset).toBe("codex");
		expect(retainedCalls[2]?.requestId).toBe(retainedCalls[1]?.requestId);
		expect(retainedCalls[0]?.requestId).not.toBe(retainedCalls[1]?.requestId);
	},
};
export const AssignmentLoading: Story = { args: { assignment: { status: "loading" } } };
export const AssignmentError: Story = {
	args: {
		assignment: { status: "error", detail: "The assigned-run query is unavailable.", retry: noop },
	},
};
export const AssignmentErrorRetry: Story = {
	args: {
		assignment: { status: "error", detail: "The assigned-run query is unavailable.", retry: noop },
	},
	play: clickButton("Retry"),
};
export const RequestError: Story = {
	parameters: { trellis: { responses: { "agentRuns.start": failure } } },
	play: clickButton("Start 2 agents"),
};
export const Success: Story = { play: clickButton("Start 2 agents") };
