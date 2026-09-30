import type { Meta, StoryObj } from "@storybook/react-vite";
import { CheckResults } from "@trellis/ui/review";
import { useMemo } from "react";
import { useStoryState } from "../useStoryState";

const meta = {
	title: "Components/CheckResults",
	component: CheckResults,
	args: {
		title: "Checks",
		description: "Checks for the selected commit.",
		groups: [
			{
				key: "failed",
				label: "Failed",
				checks: [
					{ key: "lint", name: "Lint", status: "failed", workflow: "Verify", outcome: "Failed", required: true },
				],
			},
			{
				key: "success",
				label: "Passed",
				checks: [{ key: "types", name: "Types", status: "success", outcome: "Passed" }],
			},
		],
		isCollapsed: (): boolean => false,
		onToggle: () => {},
	},
	render: function Render(args) {
		const initialCollapsed = useMemo(
			() => new Set(args.groups.filter((group) => args.isCollapsed(group.key)).map((group) => group.key)),
			[args.groups, args.isCollapsed],
		);
		const [collapsed, setCollapsed] = useStoryState(initialCollapsed);
		return (
			<CheckResults
				{...args}
				isCollapsed={(key) => collapsed.has(key)}
				onToggle={(key) =>
					setCollapsed(
						(value) => new Set(value.has(key) ? [...value].filter((entry) => entry !== key) : [...value, key]),
					)
				}
			/>
		);
	},
} satisfies Meta<typeof CheckResults>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { groups: [] } };
export const Loading: Story = { args: { loading: true, groups: [] } };
export const Collapsed: Story = { args: { isCollapsed: () => true } };
