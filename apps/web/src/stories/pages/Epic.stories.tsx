import type { Meta, StoryObj } from "@storybook/react-vite";
import { EpicPage } from "../../features/epics/EpicPage";
import { emptyCounts, epic, waves } from "./fixtures/epic";
import { archivedProject, failure, pending, project } from "./fixtures/project";
import { documentResource, resources, resourceThread } from "./fixtures/resources";
import { projectResponses, ticketCounts, ticketPage } from "./fixtures/responses";

const meta = {
	title: "Pages/Epic",
	component: EpicPage,
	args: { project, slug: epic.slug, search: {}, onSearchChange: () => {} },
	parameters: {
		layout: "fullscreen",
		trellis: { path: "/p/DEMO/epics/interface-review", responses: projectResponses },
	},
} satisfies Meta<typeof EpicPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const WavesAndTickets: Story = {};
export const Empty: Story = {
	parameters: {
		trellis: {
			responses: {
				"epics.get": {
					...epic,
					counts: emptyCounts,
					waves: [],
					tickets: [],
					waveCount: 0,
					currentWave: null,
					currentWaveIndex: null,
				},
				"tickets.list": ticketPage([]),
				"tickets.counts": ticketCounts([]),
			},
		},
	},
};
export const EmptyWaves: Story = {
	parameters: {
		trellis: {
			responses: {
				"epics.get": {
					...epic,
					counts: emptyCounts,
					tickets: [],
					waves: waves.map((wave) => ({ ...wave, counts: emptyCounts, toStart: 0, waitsForYou: 0 })),
				},
				"tickets.list": ticketPage([]),
				"tickets.counts": ticketCounts([]),
			},
		},
	},
};
export const Loading: Story = { parameters: { trellis: { responses: { "epics.get": pending } } } };
export const RequestError: Story = { parameters: { trellis: { responses: { "epics.get": failure } } } };
export const Archived: Story = { args: { project: archivedProject } };
export const Narrow: Story = { globals: { viewport: { value: "phone", isRotated: false } } };
export const Resources: Story = { args: { search: { tab: "resources" } } };
export const ResourceDocument: Story = {
	args: { search: { tab: "resources" } },
	parameters: {
		trellis: {
			path: `/p/DEMO/epics/interface-review#${documentResource.id}`,
			responses: {
				"resources.list": resources,
				"resources.get": documentResource,
				"resourceComments.list": [resourceThread],
				"resourceComments.anchors": [],
			},
		},
	},
};
export const ResourceDocumentNarrow: Story = {
	...ResourceDocument,
	globals: { viewport: { value: "phone", isRotated: false } },
};
export const ResourcesLoading: Story = {
	args: { search: { tab: "resources" } },
	parameters: { trellis: { responses: { "resources.list": pending } } },
};
export const ResourcesError: Story = {
	args: { search: { tab: "resources" } },
	parameters: { trellis: { responses: { "resources.list": failure } } },
};
