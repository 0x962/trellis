import type { Meta, StoryObj } from "@storybook/react-vite";
import { SessionSheet } from "../../features/shell/PageSheetHost/components/SessionSheet";
import { pageSheetActions } from "../../stores/pageSheetStore";
import { failure, pending } from "./fixtures/project";
import { run, sessionResponses } from "./fixtures/session";

const meta = {
	title: "Pages/Session sheet",
	component: SessionSheet,
	beforeEach: () => {
		pageSheetActions.openSession(run.id);
	},
	parameters: { layout: "fullscreen", trellis: { path: "/search", responses: sessionResponses } },
} satisfies Meta<typeof SessionSheet>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Paused: Story = {};
export const Loading: Story = { parameters: { trellis: { responses: { "agentRuns.list": pending } } } };
export const RequestError: Story = { parameters: { trellis: { responses: { "agentRuns.list": failure } } } };
export const Missing: Story = {
	parameters: { trellis: { responses: { "agentRuns.list": { items: [], nextCursor: null } } } },
};
export const Starting: Story = {
	parameters: {
		trellis: {
			responses: {
				"agentRuns.list": { items: [{ ...run, state: "starting", processStatus: null }], nextCursor: null },
			},
		},
	},
};
export const Narrow: Story = { globals: { viewport: { value: "phone", isRotated: false } } };
