import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { ProjectSessionsPage } from "../../features/sessions/ProjectSessionsPage";
import { archivedProject, failure, pending, project } from "./fixtures/project";
import { sessionResponses } from "./fixtures/session";
import { pageFrame } from "./pageFrame";

const meta = {
	decorators: [pageFrame],
	title: "Pages/Project sessions",
	component: ProjectSessionsPage,
	args: { project },
	parameters: { layout: "fullscreen", trellis: { path: "/sessions/project/DEMO", responses: sessionResponses } },
} satisfies Meta<typeof ProjectSessionsPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(await canvas.findByRole("button", { name: /^Review the ticket layout ·/ })).toBeVisible();
		await expect(await canvas.findByRole("region", { name: "Review the ticket layout conversation" })).toBeVisible();
	},
};
export const Empty: Story = {
	parameters: { trellis: { responses: { "agentRuns.list": { items: [], nextCursor: null }, "sessions.list": [] } } },
};
export const Loading: Story = {
	parameters: { trellis: { responses: { "agentRuns.list": pending, "sessions.list": pending } } },
};
export const RequestError: Story = {
	parameters: { trellis: { responses: { "agentRuns.list": failure, "sessions.list": failure } } },
};
export const ArchivedProject: Story = { args: { project: archivedProject } };
export const Narrow: Story = { globals: { viewport: { value: "phone", isRotated: false } } };
