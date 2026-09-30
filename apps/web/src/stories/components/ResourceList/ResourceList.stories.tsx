import type { Meta, StoryObj } from "@storybook/react-vite";
import { ResourceList } from "@trellis/ui";
import { useStoryState } from "../useStoryState";

const meta = {
	title: "Components/ResourceList",
	component: ResourceList,
	args: {
		rows: [
			{ id: "plan", kind: "doc", name: "Release plan", detail: "The epic description", pullRequest: null, plan: true },
			{ id: "doc", kind: "doc", name: "Review notes", detail: "Edited by Dana Lee", pullRequest: null },
			{ id: "link", kind: "link", name: "Release issue", detail: "example.test", pullRequest: 42 },
			{ id: "image", kind: "image", name: "project-view.png", detail: "24 KB", pullRequest: null },
			{ id: "file", kind: "file", name: "checks.txt", detail: "2 KB", pullRequest: null },
		],
		onOpen: () => {},
		onNewDocument: () => {},
	},
	parameters: {
		docs: {
			description: {
				component:
					"Select a row to mark its local document active. ResourceList renders ResourceRow for document, link, image, and file rows.",
			},
		},
	},
	render: function Render(args) {
		const [selectedId, setSelectedId] = useStoryState(args.selectedId);
		return <ResourceList {...args} selectedId={selectedId} onOpen={setSelectedId} />;
	},
} satisfies Meta<typeof ResourceList>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { rows: [] } };
export const Loading: Story = { args: { rows: [], loading: true } };
export const ErrorState: Story = { args: { rows: [], error: "The resources do not load." } };
export const Selected: Story = { args: { selectedId: "doc" } };
export const Creating: Story = { args: { newDocumentPending: true } };
