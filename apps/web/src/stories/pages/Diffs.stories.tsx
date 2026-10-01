import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProjectDiffsPage } from "../../features/reviews/ProjectDiffsPage";
import { failure, pending, project } from "./fixtures/project";
import { reviewResponses } from "./fixtures/review";

const meta = {
	title: "Pages/Diffs",
	component: ProjectDiffsPage,
	args: { project },
	parameters: { layout: "fullscreen", trellis: { path: "/p/DEMO/diffs", responses: reviewResponses } },
} satisfies Meta<typeof ProjectDiffsPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {};
export const Empty: Story = { parameters: { trellis: { responses: { "reviews.prs": [] } } } };
export const Loading: Story = { parameters: { trellis: { responses: { "reviews.prs": pending } } } };
export const RequestError: Story = { parameters: { trellis: { responses: { "reviews.prs": failure } } } };
export const Narrow: Story = { globals: { viewport: { value: "phone", isRotated: false } } };
