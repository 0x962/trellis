import type { Meta, StoryObj } from "@storybook/react-vite";
import type { RunLineValue } from "@trellis/ui";
import { RunLine } from "@trellis/ui";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { useStoryState } from "../useStoryState";

const run: RunLineValue = {
	name: "Review agent",
	harness: "Codex",
	profile: { provider: "openai", model: "GPT-6 Astra", effort: "High" },
	kind: "works",
	words: "The agent reviews the project view.",
	time: "2m ago",
	lastMessage: "The checks pass.",
	rawError: null,
	metricsWords: "2m elapsed, 12000 tokens",
};
const meta = {
	title: "Components/RunLine",
	component: RunLine,
	args: { run, onOpenSession: () => {} },
	parameters: {
		docs: {
			description: {
				component:
					"Hover the run to inspect its metrics. Session reports the selected run. Retry changes the local run to its start state.",
			},
		},
	},
	render: function Render(args) {
		const [currentRun, setRun] = useStoryState(args.run);
		const [retry, setRetry] = useStoryState(args.retry);
		const [session, setSession] = useState("");
		return (
			<>
				<RunLine
					{...args}
					run={currentRun}
					onOpenSession={() => setSession(`Selected session: ${currentRun!.name}`)}
					retry={
						retry && {
							...retry,
							onRetry: () => {
								setRun({ ...currentRun!, kind: "starts", words: "starts", time: "now", rawError: null });
								setRetry(null);
							},
						}
					}
				/>
				<p role="status" className="text-sm text-fg-muted">
					{session}
				</p>
			</>
		);
	},
} satisfies Meta<typeof RunLine>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Starts: Story = { args: { run: { ...run, kind: "starts", words: "starts" } } };
export const Question: Story = { args: { run: { ...run, kind: "question", words: "question" } } };
export const Permission: Story = { args: { run: { ...run, kind: "permission", words: "permission" } } };
export const Elicitation: Story = { args: { run: { ...run, kind: "elicitation", words: "elicitation" } } };
export const Idle: Story = { args: { run: { ...run, kind: "idle", words: "idle" } } };
export const TurnDone: Story = { args: { run: { ...run, kind: "turn-done", words: "turn-done" } } };
export const TurnDoneNew: Story = { args: { run: { ...run, kind: "turn-done-new", words: "turn-done-new" } } };
export const Failed: Story = { args: { run: { ...run, kind: "failed", words: "failed" } } };
export const Lost: Story = { args: { run: { ...run, kind: "lost", words: "lost" } } };
export const Empty: Story = { args: { run: null } };
export const NoMessage: Story = { args: { run: { ...run, lastMessage: null } } };
export const RawError: Story = {
	args: { run: { ...run, kind: "failed", rawError: "The process exits with code 1." } },
};
export const Retry: Story = { args: { retry: { starting: false, error: null, onRetry: () => {} } } };
export const RetryPending: Story = { args: { retry: { starting: true, error: null, onRetry: () => {} } } };
export const RetryFailed: Story = {
	args: { retry: { starting: false, error: "The process does not start.", onRetry: () => {} } },
};
export const RetryRun: Story = {
	args: { run: { ...run, kind: "failed", words: "failed" }, ...RetryFailed.args },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
		await expect(canvas.getByText("starts")).toBeVisible();
		await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
		await userEvent.click(canvas.getByRole("button", { name: "Session" }));
		await expect(canvas.getByText("Selected session: Review agent")).toBeVisible();
	},
};
export const LongMessage: Story = { args: { run: { ...run, lastMessage: "The checks pass. ".repeat(60) } } };
