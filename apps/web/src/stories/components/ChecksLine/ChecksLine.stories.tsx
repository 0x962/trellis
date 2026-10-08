import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CheckStatus } from "@trellis/ui/review";
import { ChecksLine } from "@trellis/ui/review";
import { useMemo } from "react";
import { useStoryState } from "../useStoryState";

const meta = {
	title: "Components/ChecksLine",
	component: ChecksLine,
	args: {
		checks: [
			{ name: "Lint", workflow: "Verify", bucket: "fail", link: null, required: true },
			{ name: "Build", workflow: "Verify", bucket: "pending", link: null, status: "running" },
			{
				name: "Types",
				workflow: "Verify",
				bucket: "pass",
				link: null,
				startedAt: "2026-09-30T12:00:00Z",
				endedAt: "2026-09-30T12:01:00Z",
			},
			{ name: "Deploy", workflow: "Release", bucket: "skipping", link: null },
		],
		isCollapsed: (): boolean => false,
		onToggle: () => {},
		onOpenCheck: () => {},
	},
	parameters: {
		docs: {
			description: {
				component: "Expand each group to inspect its checks. Every check uses local data and no external link.",
			},
		},
	},
	render: function Render(args) {
		const initialCollapsed = useMemo(
			() =>
				new Set<CheckStatus>(
					(["success", "failed", "pending", "running", "skipped", "canceled", "unknown", "neutral"] as const).filter(
						args.isCollapsed,
					),
				),
			[args.isCollapsed],
		);
		const [collapsed, setCollapsed] = useStoryState(initialCollapsed);
		return (
			<ChecksLine
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
} satisfies Meta<typeof ChecksLine>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { checks: [] } };
export const Loading: Story = { args: { checks: [], loading: true } };
export const Collapsed: Story = { args: { isCollapsed: () => true } };
export const Canceled: Story = {
	args: { checks: [{ name: "Build", workflow: "Verify", bucket: "cancel", link: null }] },
};
export const Unknown: Story = {
	args: { checks: [{ name: "Build", workflow: "Verify", bucket: "pending", status: "unknown", link: null }] },
};
export const Neutral: Story = {
	args: { checks: [{ name: "Deploy", workflow: "Release", bucket: "skipping", status: "neutral", link: null }] },
};
export const ManyChecks: Story = {
	args: {
		checks: Array.from({ length: 100 }, (_, index) => ({
			name: `Check ${index + 1}`,
			workflow: "Verify",
			bucket: "pass",
			link: null,
		})),
	},
};
