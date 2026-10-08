import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { TicketAgent } from "../../features/agents/TicketAgent";
import { SessionSheet } from "../../features/shell/PageSheetHost/components/SessionSheet";
import { pageSheetActions } from "../../stores/pageSheetStore";
import { responsesForSession, terminalSession } from "../pages/fixtures/sessionStates";
import { failure, id, responses } from "./fixtures";

const detail = terminalSession("idle");
const run = {
	...detail.run,
	kind: "agent" as const,
	name: "Retained review agent",
	ticketId: id(30),
	ticketIdentifier: "DEMO-1",
	ticketTitle: "Retained assignment",
	state: "stopped" as const,
	processStatus: "exited" as const,
	terminalId: null,
	observation: null,
};
let reads = 0;
const meta = {
	title: "Overlays/SessionSheetRecovery",
	component: TicketAgent,
	args: { ticket: "DEMO-1" },
	beforeEach: () => {
		reads = 0;
		pageSheetActions.closeSession();
	},
	render: (args) => (
		<div className="p-3">
			<TicketAgent {...args} />
			<SessionSheet />
		</div>
	),
} satisfies Meta<typeof TicketAgent>;
export default meta;
type Story = StoryObj<typeof meta>;

const recovery = (background: boolean): Story => ({
	parameters: {
		trellis: {
			responses: {
				...responses,
				...responsesForSession({ ...detail, run }),
				"agentRuns.list": (input: { ids?: string[] }) => {
					if (input.ids && ++reads === (background ? 2 : 1)) return failure();
					return { items: [run], nextCursor: null };
				},
			},
		},
	},
	play: async ({ canvasElement }) => {
		const body = within(canvasElement.ownerDocument.body);
		(await body.findByRole("button", { name: /Open Retained review agent session/ })).focus();
		await userEvent.keyboard("{Enter}");
		const title = background ? "The session did not refresh" : "The session did not load";
		const regionName = "Retained assignment conversation";
		const retained = background ? await body.findByRole("region", { name: regionName }) : null;
		await waitFor(() => expect(body.getByRole("heading", { name: title })).toBeVisible(), { timeout: 5000 });
		if (retained) await expect(retained).toBeVisible();
		await userEvent.click(body.getByRole("button", { name: /^Retry$/ }));
		await waitFor(() => expect(body.queryByRole("heading", { name: title })).not.toBeInTheDocument());
		await waitFor(() => expect(body.getByRole("region", { name: regionName })).toBeVisible());
		if (retained) await expect(body.getByRole("region", { name: regionName })).toBe(retained);
	},
});
export const InitialFailure = recovery(false);
export const RefreshRecovery = recovery(true);
