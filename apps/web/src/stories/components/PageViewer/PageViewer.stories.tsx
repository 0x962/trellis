import type { Meta, StoryObj } from "@storybook/react-vite";
import { FailureState, PageViewer } from "@trellis/ui";

const meta = {
	title: "Components/PageViewer",
	component: PageViewer,
	args: {
		title: "Release notes",
		version: 3,
		frameUrl:
			"data:text/html;charset=utf-8," +
			encodeURIComponent(
				"<!doctype html><html><body><h1>Release notes</h1><p>The project view retains the ticket selection.</p></body></html>",
			),
		frameRef: null,
		pending: false,
		status: "Page ready",
	},
	parameters: {
		docs: {
			description: { component: "The sandboxed frame uses a local data URL. This story makes no server request." },
		},
	},
	render: (args) => (
		<div className="flex h-100 flex-col">
			<PageViewer {...args} />
		</div>
	),
} satisfies Meta<typeof PageViewer>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Loading: Story = { args: { pending: true, frameUrl: null, status: "Load Page" } };
export const ErrorState: Story = {
	args: {
		frameUrl: null,
		error: <FailureState title="The page does not load" detail="The render lease expired." />,
		status: "Page unavailable",
	},
};
export const Refreshing: Story = { args: { pending: true, status: "Page refresh in progress" } };
export const Empty: Story = { args: { frameUrl: null } };
