import type { Meta, StoryObj } from "@storybook/react-vite";
import { UsagePage } from "../../features/usage/UsagePage";
import { Route } from "../../routes/usage";
import { failure, pending } from "./fixtures/project";
import { systemUsage, usageReport, usageResponses } from "./fixtures/usage";

const meta = {
	title: "Pages/Usage",
	component: UsagePage,
	parameters: {
		layout: "fullscreen",
		trellis: { route: Route, routePath: "/usage", path: "/usage", loadRoute: false, responses: usageResponses },
	},
} satisfies Meta<typeof UsagePage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Agent: Story = {};
export const TokensByModel: Story = { parameters: { trellis: { path: "/usage?metric=tokens&group=model" } } };
export const SelectedDayAndTicket: Story = { parameters: { trellis: { path: "/usage?row=DEMO-40&day=2026-09-30" } } };
export const Empty: Story = {
	parameters: {
		trellis: { responses: { "usage.report": { ...usageReport, totals: { ...usageReport.totals, sessions: 0 } } } },
	},
};
export const Loading: Story = { parameters: { trellis: { responses: { "usage.report": pending } } } };
export const RequestError: Story = { parameters: { trellis: { responses: { "usage.report": failure } } } };
export const Narrow: Story = { globals: { viewport: { value: "phone", isRotated: false } } };
export const System: Story = { parameters: { trellis: { path: "/usage?tab=system" } } };
export const SystemLoading: Story = {
	parameters: { trellis: { path: "/usage?tab=system", responses: { "system.usage": pending } } },
};
export const SystemError: Story = {
	parameters: { trellis: { path: "/usage?tab=system", responses: { "system.usage": failure } } },
};
export const MemoryPressure: Story = {
	parameters: {
		trellis: {
			path: "/usage?tab=system",
			responses: { "system.usage": { ...systemUsage, memoryPercent: 96, memoryLevel: 4 } },
		},
	},
};
export const SystemNarrow: Story = {
	parameters: { trellis: { path: "/usage?tab=system" } },
	globals: { viewport: { value: "phone", isRotated: false } },
};
