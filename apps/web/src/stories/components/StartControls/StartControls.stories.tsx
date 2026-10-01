import type { Meta, StoryObj } from "@storybook/react-vite";
import { Select, StartControls } from "@trellis/ui";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { useStoryState } from "../useStoryState";

const meta = {
	title: "Components/StartControls",
	component: StartControls,
	args: {
		pickers: null,
		dependencies: [],
		starting: false,
		error: null,
		onStart: () => {},
	},
	parameters: {
		docs: {
			description: {
				component:
					"Choose an agent and start a local run. Open dependencies permit an explicit start. The result appears below the control.",
			},
		},
	},
	render: function Render(args) {
		const [agent, setAgent] = useState("Codex");
		const [started, setStarted] = useState(false);
		const [error, setError] = useStoryState(args.error);
		return (
			<>
				<StartControls
					{...args}
					disabled={args.disabled || started}
					error={error}
					pickers={
						<Select
							label="Agent"
							hideLabel
							value={agent}
							onValueChange={setAgent}
							items={[
								{ value: "Codex", label: "Codex" },
								{ value: "Claude", label: "Claude" },
							]}
							disabled={args.starting}
						/>
					}
					onStart={() => {
						setError(null);
						setStarted(true);
					}}
				/>
				<p role="status" className="text-sm text-fg-muted">
					{started ? `The local ${agent} run has started.` : ""}
				</p>
			</>
		);
	},
} satisfies Meta<typeof StartControls>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Disabled: Story = { args: { disabled: true } };
export const Starting: Story = { args: { starting: true } };
export const ErrorState: Story = { args: { error: "The agent does not start." } };
export const OneDependency: Story = {
	args: { dependencies: [{ identifier: "TRL-42", title: "Restore the project view", reason: "is open" }] },
};
export const SeveralDependencies: Story = {
	args: {
		dependencies: [
			{ identifier: "TRL-42", title: "Restore the project view", reason: "is open" },
			{ identifier: "TRL-43", title: "Review the ticket selection", reason: "is not merged" },
		],
	},
};
export const ManyAgents: Story = { args: { label: "Start 4 agents" } };
export const StartAnyway: Story = {
	args: { ...OneDependency.args, error: "The agent does not start." },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole("button", { name: "Start" }));
		await expect(canvas.getByText("The local Codex run has started.")).toBeVisible();
		await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
	},
};
