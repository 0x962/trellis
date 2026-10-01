import type { Meta, StoryObj } from "@storybook/react-vite";
import { type FileRiskGroup, FileRiskGroups } from "@trellis/ui/review";
import { useMemo } from "react";
import { FileRiskGroupsSection } from "../../../../../../packages/ui/src/gallery/components/DomainSections/sections/FileRiskGroupsSection";
import { useStoryState } from "../useStoryState";

const groups: FileRiskGroup[] = [
	{
		key: "behavior",
		label: "Behavior",
		files: [
			{ path: "src/project.ts", change: "change", additions: 12, deletions: 3, binary: false, reasons: ["public API"] },
			{ path: "src/selection.ts", change: "new", additions: 24, deletions: 0, binary: false, reasons: [] },
			{ path: "src/oldSelection.ts", change: "deleted", additions: 0, deletions: 40, binary: false, reasons: [] },
			{ path: "src/renamed.ts", change: "rename-pure", additions: 0, deletions: 0, binary: false, reasons: [] },
			{ path: "src/moved.ts", change: "rename-changed", additions: 2, deletions: 1, binary: false, reasons: [] },
			{ path: "public/mark.png", change: "new", additions: 0, deletions: 0, binary: true, reasons: [] },
		],
	},
];

const meta = {
	title: "Components/FileRiskGroups",
	component: FileRiskGroups,
	args: {
		groups,
		read: new Set<string>(),
		selected: "",
		onSelect: () => {},
		isCollapsed: (): boolean => false,
		onToggle: () => {},
	},
	parameters: {
		docs: {
			description: {
				component:
					"Expand each risk group and its directories. Select a file to inspect its selected state. The fixture includes binary, added, deleted, renamed, and read files.",
			},
		},
	},
	render: function Render(args) {
		const [selected, setSelected] = useStoryState(args.selected);
		const initialCollapsed = useMemo(
			() => new Set(args.groups.filter((group) => args.isCollapsed(group.key)).map((group) => group.key)),
			[args.groups, args.isCollapsed],
		);
		const [collapsed, setCollapsed] = useStoryState(initialCollapsed);
		return (
			<FileRiskGroups
				{...args}
				selected={selected}
				onSelect={setSelected}
				isCollapsed={(key) => collapsed.has(key)}
				onToggle={(key) => {
					const next = new Set(collapsed);
					if (!next.delete(key)) next.add(key);
					setCollapsed(next);
				}}
			/>
		);
	},
} satisfies Meta<typeof FileRiskGroups>;
export default meta;
type Story = StoryObj<typeof meta>;

export const InteractiveStates: Story = { render: () => <FileRiskGroupsSection /> };
export const Default: Story = {};
export const Empty: Story = { args: { groups: [] } };
export const Selected: Story = { args: { selected: "src/project.ts" } };
export const AllRead: Story = { args: { read: new Set(groups[0]!.files.map((file) => file.path)) } };
export const Collapsed: Story = { args: { isCollapsed: () => true } };
