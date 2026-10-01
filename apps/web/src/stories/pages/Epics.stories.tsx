import type { Meta, StoryObj } from "@storybook/react-vite";
import { EpicsPage } from "../../features/epics/EpicsPage";
import { archivedProject, failure, pending, project } from "./fixtures/project";
import { projectResponses } from "./fixtures/responses";
import { pageFrame } from "./pageFrame";

const meta = {
	decorators: [pageFrame],
	title: "Pages/Epics",
	component: EpicsPage,
	args: { project },
	parameters: { layout: "fullscreen", trellis: { path: "/p/DEMO/epics", responses: projectResponses } },
} satisfies Meta<typeof EpicsPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Populated: Story = {};
export const Empty: Story = { parameters: { trellis: { responses: { "epics.list": [] } } } };
export const Loading: Story = { parameters: { trellis: { responses: { "epics.list": pending } } } };
export const RequestError: Story = { parameters: { trellis: { responses: { "epics.list": failure } } } };
export const Archived: Story = { args: { project: archivedProject } };
export const Narrow: Story = { globals: { viewport: { value: "phone", isRotated: false } } };
