import { FunnelSimple } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { IconButton } from "@trellis/ui";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { FilterBar } from "../../features/filters/FilterBar";
import { FilterPicker } from "../../features/filters/FilterBar/components/FilterPicker";
import { type View, viewOf } from "../../features/filters/grammar";
import { filterLabels } from "../../features/filters/labelValues";
import { DisplayPopover } from "../../features/table/DisplayPopover";
import { useStoryState } from "../components/useStoryState";
import { labels, noop, responses, statuses } from "./fixtures";
import { clickButton } from "./interactions";

const meta = {
	title: "Overlays/Filters",
	component: FilterPicker,
	render: function Render(args) {
		const [view, setView] = useStoryState(args.view);
		const [open, setOpen] = useStoryState(args.open);
		const [stage, setStage] = useStoryState(args.stage);
		return (
			<FilterPicker
				{...args}
				view={view}
				open={open}
				stage={stage}
				onChange={setView}
				onOpenChange={(next) => {
					setOpen(next);
					if (!next) setStage({ kind: "fields" });
				}}
				onStageChange={setStage}
			/>
		);
	},
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
	render: function Render() {
		const [search, setSearch] = useState<Partial<View>>({
			priority: ["high"],
			status: ["todo"],
			label: ["Design"],
			epic: "DEMO/catalog",
		});
		return <FilterBar project="DEMO" statuses={statuses} search={search} onSearchChange={setSearch} />;
	},
};
export const ShareMenu: Story = { ...FilterChips, play: clickButton("Share") };
export const DisplayClosed: Story = {
	render: function Render() {
		const [search, setSearch] = useState<Partial<View>>({ group: "status", sort: "priority" });
		return (
			<DisplayPopover
				routeKey="storybook"
				showProject
				search={search}
				onSearchChange={setSearch}
				group={search.group!}
				sort={search.sort!}
			/>
		);
	},
};
export const DisplayOpen: Story = { ...DisplayClosed, play: clickButton("Display") };
export const DisplaySelected: Story = {
	render: function Render() {
		const [search, setSearch] = useState<Partial<View>>({ closed: "hide", group: "wave", sort: "number" });
		return (
			<DisplayPopover
				routeKey="storybook-epic"
				showProject={false}
				epicFixed
				search={search}
				onSearchChange={setSearch}
				group={search.group!}
				sort={search.sort!}
			/>
		);
	},
	play: clickButton("Display"),
};
export const DisplayDisabled: Story = {
	render: function Render() {
		const [search, setSearch] = useState<Partial<View>>({ group: "none", sort: "-createdAt" });
		return (
			<DisplayPopover
				routeKey="storybook-flat"
				showProject={false}
				search={search}
				onSearchChange={setSearch}
				group={search.group!}
				sort={search.sort!}
			/>
		);
	},
	play: clickButton("Display"),
};

export const ChangeFilter: Story = {
	args: { open: false },
	play: async (context) => {
		const body = within(context.canvasElement.ownerDocument.body);
		await clickButton("Filter")(context);
		await userEvent.click(await body.findByRole("option", { name: "Priority" }));
		const high = await body.findByRole("option", { name: "High" });
		await userEvent.click(high);
		await waitFor(() => expect(high).toHaveAttribute("data-checked", "true"));
		await userEvent.click(high);
		await waitFor(() => expect(high).toHaveAttribute("data-checked", "false"));
		await userEvent.keyboard("{Escape}");
		await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
		await clickButton("Filter")(context);
		await waitFor(() => expect(body.getByRole("combobox", { name: "Search fields" })).toBeVisible());
	},
};
export const RemoveFilter: Story = {
	...FilterChips,
	play: async (context) => {
		const body = within(context.canvasElement.ownerDocument.body);
		await clickButton("Remove Priority filter")(context);
		await expect(body.queryByRole("button", { name: "Remove Priority filter" })).not.toBeInTheDocument();
	},
};
export const ChangeDisplay: Story = {
	...DisplayClosed,
	play: async (context) => {
		const body = within(context.canvasElement.ownerDocument.body);
		await clickButton("Display")(context);
		const completed = await body.findByRole("switch", { name: "Show completed" });
		await userEvent.click(completed);
		await expect(completed).not.toBeChecked();
		await userEvent.click(await body.findByRole("combobox", { name: "Group by" }));
		await userEvent.click(await body.findByRole("option", { name: "Priority" }));
		await waitFor(() => expect(completed).toHaveAttribute("aria-disabled", "true"));
		await userEvent.click(completed);
		await expect(completed).not.toBeChecked();
	},
};
