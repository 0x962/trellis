import type { Meta, StoryObj } from "@storybook/react-vite";
import type { AgentRun } from "@trellis/api";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { TicketAgent } from "../../features/agents/TicketAgent";
import { SessionSheet } from "../../features/shell/PageSheetHost/components/SessionSheet";
import { pageSheetActions } from "../../stores/pageSheetStore";
import { responsesForSession, terminalSession } from "../pages/fixtures/sessionStates";
import { id, responses } from "./fixtures";

const detail = terminalSession("idle");
const paused: AgentRun = {
	...detail.run,
	kind: "agent",
	name: "Assigned review agent",
	ticketId: id(30),
	ticketIdentifier: "DEMO-1",
	ticketTitle: "Review the assignment",
	ticketStatusCategory: "started",
	state: "stopped",
	processStatus: "exited",
	terminalId: null,
	observation: null,
};
const meta = {
	title: "Overlays/TicketAgentSession",
	component: TicketAgent,
	args: { ticket: "DEMO-1" },
	beforeEach: () => pageSheetActions.closeSession(),
	render: (args) => (
		<div className="p-3">
			<TicketAgent {...args} />
			<SessionSheet />
		</div>
	),
} satisfies Meta<typeof TicketAgent>;
export default meta;
type Story = StoryObj<typeof meta>;

const journey = (run: AgentRun, label: string): Story => ({
	parameters: {
		trellis: {
			responses: {
				...responses,
				...responsesForSession({ ...detail, run }),
				"agentRuns.list": { items: [run], nextCursor: null },
			},
		},
	},
	play: async ({ canvasElement }) => {
		const body = within(canvasElement.ownerDocument.body);
		await expect(await body.findByText(label, { exact: true })).toBeVisible();
		(await body.findByRole("button", { name: /Open Assigned review agent session/ })).focus();
		await userEvent.keyboard("{Enter}");
		const conversation = await body.findByRole("region", { name: "Review the assignment conversation" });
		await waitFor(() =>
			expect(within(conversation).getByRole("img", { name: new RegExp(label.toLowerCase()) })).toBeVisible(),
		);
		await waitFor(() =>
			expect(within(conversation).getByRole("heading", { name: `The agent is ${label.toLowerCase()}` })).toBeVisible(),
		);
	},
});
export const Paused = journey(paused, "Paused");
export const Completed = journey({ ...paused, ticketStatusCategory: "done" }, "Done");
export const OutcomeCompleted = journey(
	{
		...paused,
		observation: { ...detail.run.observation!, outcome: "completed" },
	},
	"Done",
);
