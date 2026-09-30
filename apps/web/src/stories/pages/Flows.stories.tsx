import type { Meta, StoryObj } from "@storybook/react-vite";
import { FlowsPage } from "../../features/flows/FlowsPage";
import { flowResponses } from "./fixtures/flow";
import { failure, pending } from "./fixtures/project";

const meta = {
	title: "Pages/Flows",
	component: FlowsPage,
	parameters: { layout: "fullscreen", trellis: { path: "/ai/flows", responses: flowResponses } },
} satisfies Meta<typeof FlowsPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const MixedEnginesAndPublication: Story = {};
export const Empty: Story = { parameters: { trellis: { responses: { "flows.list": [] } } } };
export const Loading: Story = { parameters: { trellis: { responses: { "flows.list": pending } } } };
export const RequestError: Story = { parameters: { trellis: { responses: { "flows.list": failure } } } };
export const Narrow: Story = { globals: { viewport: { value: "phone", isRotated: false } } };
