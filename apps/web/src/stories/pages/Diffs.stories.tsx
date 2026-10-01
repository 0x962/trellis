import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { ProjectDiffsPage } from "../../features/reviews/ProjectDiffsPage";
import { failure, pending, project } from "./fixtures/project";
import { reviewResponses } from "./fixtures/review";
import { pageFrame } from "./pageFrame";

const meta = {
	decorators: [pageFrame],
	title: "Pages/Diffs",
	component: ProjectDiffsPage,
	args: { project },
	parameters: { layout: "fullscreen", trellis: { path: "/p/DEMO/diffs", responses: reviewResponses } },
} satisfies Meta<typeof ProjectDiffsPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {
	play: async ({ canvasElement }) => {
		await expect(await within(canvasElement).findByRole("link", { name: /^#42 Keep the ticket title/ })).toBeVisible();
	},
};
export const Empty: Story = {
	parameters: { trellis: { responses: { "reviews.prs": [], "reviews.mine": [] } } },
};
export const Loading: Story = {
	parameters: { trellis: { responses: { "reviews.prs": pending, "reviews.mine": pending } } },
};
export const RequestError: Story = {
	parameters: { trellis: { responses: { "reviews.prs": failure, "reviews.mine": failure } } },
};
export const Narrow: Story = { globals: { viewport: { value: "phone", isRotated: false } } };
