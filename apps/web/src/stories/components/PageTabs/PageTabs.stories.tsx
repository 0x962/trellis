import type { Meta, StoryObj } from "@storybook/react-vite";
import { type PageTabGroupItem, PageTabs } from "@trellis/ui";
import { useRef } from "react";
import { expect, userEvent, within } from "storybook/test";
import { useStoryState } from "../useStoryState";

const emptyGroups: PageTabGroupItem[] = [];

const meta = {
	title: "Components/PageTabs",
	component: PageTabs,
	args: {
		tabs: [
			{ id: "one", title: "Release notes", pinned: true },
			{ id: "two", title: "Project view", pinned: false },
			{ id: "three", title: "Review findings", pinned: false },
		],
		groups: [],
		activeId: "two",
		onAdd: () => {},
		onSelect: () => {},
		onClose: () => {},
	},
	parameters: {
		docs: {
			description: {
				component:
					"Select, add, close, pin, rename, sort, and drag tabs. The context menu also creates and edits groups. Every action changes local data.",
			},
		},
	},
	render: function Render(args) {
		const [tabs, setTabs] = useStoryState(args.tabs);
		const [groups, setGroups] = useStoryState(args.groups ?? emptyGroups);
		const [activeId, setActiveId] = useStoryState(args.activeId);
		const sequence = useRef(0);
		return (
			<div className="flex flex-col gap-4">
				<PageTabs
					{...args}
					tabs={tabs}
					groups={groups}
					activeId={activeId}
					onSelect={setActiveId}
					onAdd={() => {
						const id = `new-${++sequence.current}`;
						setTabs([...tabs, { id, title: `Page ${sequence.current}`, pinned: false }]);
						setActiveId(id);
					}}
					onClose={(id) => {
						const next = tabs.filter((tab) => tab.id !== id);
						setTabs(next);
						if (activeId === id) setActiveId(next[0]?.id ?? "");
					}}
					onPin={(id, pinned) => setTabs(tabs.map((tab) => (tab.id === id ? { ...tab, pinned } : tab)))}
					onRename={(id, title) =>
						setTabs(tabs.map((tab) => (tab.id === id ? { ...tab, title: title ?? `Page ${id}` } : tab)))
					}
					onSort={(direction) =>
						setTabs([...tabs].sort((a, b) => a.title.localeCompare(b.title) * (direction === "ascending" ? 1 : -1)))
					}
					onMove={(id, beforeId) => {
						const tab = tabs.find((item) => item.id === id)!;
						const next = tabs.filter((item) => item.id !== id);
						next.splice(beforeId === null ? next.length : next.findIndex((item) => item.id === beforeId), 0, tab);
						setTabs(next);
					}}
					onCreateGroup={(name, tabId) => {
						const id = `group-${++sequence.current}`;
						setGroups([...groups, { id, name, collapsed: false }]);
						setTabs(tabs.map((tab) => (tab.id === tabId ? { ...tab, groupId: id } : tab)));
						return id;
					}}
					onRenameGroup={(id, name) => setGroups(groups.map((group) => (group.id === id ? { ...group, name } : group)))}
					onRemoveGroup={(id) => {
						setGroups(groups.filter((group) => group.id !== id));
						setTabs(tabs.map((tab) => (tab.groupId === id ? { ...tab, groupId: undefined } : tab)));
					}}
					onGroupCollapse={(id, collapsed) =>
						setGroups(groups.map((group) => (group.id === id ? { ...group, collapsed } : group)))
					}
					onSetTabGroup={(tabId, groupId) =>
						setTabs(tabs.map((tab) => (tab.id === tabId ? { ...tab, groupId: groupId ?? undefined } : tab)))
					}
				/>
				<p role="status" className="text-sm text-fg-muted">
					Selected page: {activeId || "None"}
				</p>
			</div>
		);
	},
} satisfies Meta<typeof PageTabs>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const selected = canvas.getByRole("tab", { name: "Project view" });
		selected.focus();
		await userEvent.keyboard("{ArrowRight}");
		await expect(canvas.getByRole("tab", { name: "Review findings" })).toHaveFocus();
		await userEvent.keyboard("{Home}");
		await expect(canvas.getByRole("tab", { name: "Pinned: Release notes" })).toHaveFocus();
		await userEvent.keyboard("{End}");
		await expect(canvas.getByRole("tab", { name: "Review findings" })).toHaveAttribute("aria-selected", "true");
	},
};
export const Empty: Story = { args: { tabs: [], activeId: "" } };
export const Groups: Story = {
	args: {
		tabs: [
			{ id: "one", title: "Release notes", pinned: true },
			{ id: "two", title: "Project view", pinned: false, groupId: "review" },
			{ id: "three", title: "Review findings", pinned: false, groupId: "review" },
		],
		groups: [{ id: "review", name: "Review", collapsed: false }],
	},
};
export const CollapsedGroup: Story = {
	args: { ...Groups.args, groups: [{ id: "review", name: "Review", collapsed: true }] },
};
export const Overflow: Story = {
	args: {
		tabs: Array.from({ length: 40 }, (_, index) => ({
			id: `page-${index}`,
			title: `Project page ${index + 1} with a long title`,
			pinned: index < 4,
		})),
		activeId: "page-20",
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		canvas.getByRole("tab", { selected: true }).focus();
		await userEvent.keyboard("{End}");
		await expect(canvas.getByRole("tab", { name: "Project page 40 with a long title" })).toHaveFocus();
		await userEvent.keyboard("{ArrowRight}");
		await expect(canvas.getByRole("tab", { name: "Pinned: Project page 1 with a long title" })).toHaveFocus();
	},
};

export const CreateGroupFromPicker: Story = {
	play: async ({ canvasElement }) => {
		const page = within(canvasElement.ownerDocument.body);
		await userEvent.click(page.getByRole("button", { name: "Move tab to a group" }));
		await userEvent.type(await page.findByRole("combobox", { name: "Search groups" }), "Release");
		await userEvent.click(await page.findByRole("option", { name: 'Create group "Release"' }));
		await expect(await page.findByText("Release")).toBeVisible();
		await expect(page.getByRole("tab", { name: "Project view" })).toHaveAttribute("aria-selected", "true");
		await userEvent.click(page.getByRole("button", { name: "Move tab to a group" }));
		await userEvent.type(await page.findByRole("combobox", { name: "Search groups" }), "release");
		await expect(page.queryByRole("option", { name: 'Create group "release"' })).not.toBeInTheDocument();
	},
};
