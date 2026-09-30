import { FunnelSimple } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { IconButton } from "@trellis/ui";
import { FilterBar } from "../../features/filters/FilterBar";
import { FilterPicker } from "../../features/filters/FilterBar/components/FilterPicker";
import { viewOf } from "../../features/filters/grammar";
import { filterLabels } from "../../features/filters/labelValues";
import { DisplayPopover } from "../../features/table/DisplayPopover";
import { labels, noop, responses, statuses } from "./fixtures";
import { clickButton } from "./interactions";

const meta = {
	title: "Overlays/Filters",
	component: FilterPicker,
	args: {
		view: viewOf({}),
		statuses,
		labels: filterLabels(labels, []),
		project: "DEMO",
		onChange: noop,
		open: true,
		onOpenChange: noop,
		stage: { kind: "fields" },
		onStageChange: noop,
		trigger: <IconButton label="Filter" icon={<FunnelSimple />} />,
	},
	parameters: { trellis: { responses } },
} satisfies Meta<typeof FilterPicker>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Open: Story = {};
export const ClosedTrigger: Story = { args: { open: false } };
export const Status: Story = { args: { stage: { kind: "values", field: "status" } } };
export const Priority: Story = { args: { stage: { kind: "values", field: "priority" } } };
export const Label: Story = { args: { stage: { kind: "values", field: "label" } } };
export const Project: Story = { args: { project: undefined, stage: { kind: "values", field: "project" } } };
export const Epic: Story = { args: { stage: { kind: "values", field: "epic" } } };
export const Wave: Story = { args: { stage: { kind: "values", field: "wave" } } };
export const Actor: Story = { args: { stage: { kind: "values", field: "actor" } } };
export const PullRequest: Story = { args: { stage: { kind: "values", field: "pr" } } };
export const Checks: Story = { args: { stage: { kind: "values", field: "ci" } } };
export const Blocked: Story = { args: { stage: { kind: "values", field: "blocked" } } };
export const Parent: Story = { args: { stage: { kind: "values", field: "parent" } } };
export const Dependencies: Story = { args: { stage: { kind: "values", field: "waitsOn" } } };
export const Created: Story = { args: { stage: { kind: "values", field: "created" } } };
export const Updated: Story = { args: { stage: { kind: "values", field: "updated" } } };
export const Selected: Story = {
	args: { stage: { kind: "values", field: "priority" }, view: viewOf({ priority: ["high", "urgent"] }) },
};
export const Empty: Story = { args: { stage: { kind: "values", field: "label" }, labels: [] } };
export const FilterChips: Story = {
	render: () => (
		<FilterBar
			project="DEMO"
			statuses={statuses}
			search={{ priority: ["high"], status: ["todo"], label: ["Design"], epic: "DEMO/catalog" }}
			onSearchChange={noop}
		/>
	),
};
export const ShareMenu: Story = { ...FilterChips, play: clickButton("Share") };
export const DisplayClosed: Story = {
	render: () => (
		<DisplayPopover routeKey="storybook" showProject search={{}} onSearchChange={noop} group="status" sort="priority" />
	),
};
export const DisplayOpen: Story = { ...DisplayClosed, play: clickButton("Display") };
export const DisplaySelected: Story = {
	render: () => (
		<DisplayPopover
			routeKey="storybook-epic"
			showProject={false}
			epicFixed
			search={{ closed: "hide" }}
			onSearchChange={noop}
			group="wave"
			sort="number"
		/>
	),
	play: clickButton("Display"),
};
export const DisplayDisabled: Story = {
	render: () => (
		<DisplayPopover
			routeKey="storybook-flat"
			showProject={false}
			search={{}}
			onSearchChange={noop}
			group="none"
			sort="-createdAt"
		/>
	),
	play: clickButton("Display"),
};
