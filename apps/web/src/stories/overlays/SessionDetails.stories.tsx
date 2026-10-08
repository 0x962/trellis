import type { Meta, StoryObj } from "@storybook/react-vite";
import { SessionDetails } from "../../features/sessions/SessionConversation/components/SessionDetails";
import { OverlayTrigger } from "./components/OverlayTrigger";
import { noop, responses, run } from "./fixtures";

const summary = {
	state: "ready" as const,
	runId: run.id,
	directory: "/workspace/catalog",
	branch: "catalog-review",
	head: "abc1234",
	base: "main",
	ahead: 2,
	behind: 0,
	files: 3,
	additions: 120,
	deletions: 24,
	uncommitted: 1,
};
const meta = {
	title: "Overlays/SessionDetails",
	component: SessionDetails,
	args: { run, summary, open: true, onOpenChange: noop },
	parameters: { trellis: { responses } },
	render: (args, context) => (
		<OverlayTrigger label="Session details" initiallyOpen={!context.parameters.closed}>
			{(close) => (
				<SessionDetails
					{...args}
					onOpenChange={(open) => {
						if (!open) close();
					}}
				/>
			)}
		</OverlayTrigger>
	),
} satisfies Meta<typeof SessionDetails>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Open: Story = {};
export const ClosedTrigger: Story = { parameters: { closed: true } };
export const Loading: Story = { args: { summary: undefined } };
export const Empty: Story = { args: { summary: { ...summary, files: 0, additions: 0, deletions: 0, uncommitted: 0 } } };
export const Missing: Story = { args: { summary: { state: "missing", runId: run.id, directory: summary.directory } } };
export const RequestError: Story = {
	args: {
		summary: {
			state: "unreadable",
			runId: run.id,
			directory: summary.directory,
			error: "Git cannot read this workspace.",
		},
	},
};
export const Detached: Story = { args: { summary: { ...summary, branch: null } } };
