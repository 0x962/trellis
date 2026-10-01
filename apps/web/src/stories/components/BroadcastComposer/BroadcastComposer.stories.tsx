import { Megaphone } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { BroadcastComposer, Button, Checkbox, FailureState, IconButton, Textarea, Tooltip } from "@trellis/ui";
import { useState } from "react";

const meta = {
	title: "Components/BroadcastComposer",
	component: BroadcastComposer,
	args: {
		scope: "Desktop release",
		title: "Message the agents",
		description: "Send a message to the selected agents.",
		busy: false,
		onClose: () => {},
		onSubmit: () => {},
		children: null,
		footer: null,
	},
	parameters: {
		docs: {
			description: {
				component:
					"Edit the message and select recipient groups. Send records a local result. Busy prevents send and close. No message reaches an agent.",
			},
		},
	},
	render: function Render(args) {
		const [open, setOpen] = useState(true);
		const [message, setMessage] = useState("Review the current release.");
		const [working, setWorking] = useState(true);
		const [idle, setIdle] = useState(false);
		const [sent, setSent] = useState(false);
		const count = (working ? 3 : 0) + (idle ? 2 : 0);
		const submit = () => {
			if (!args.busy && message.trim() && count > 0) setSent(true);
		};
		return (
			<>
				<Tooltip content="Broadcast">
					<IconButton
						label="Broadcast"
						icon={<Megaphone />}
						onClick={() => {
							setOpen(true);
							setSent(false);
						}}
					/>
				</Tooltip>
				{open && (
					<BroadcastComposer
						{...args}
						onClose={() => {
							if (!args.busy) setOpen(false);
						}}
						onSubmit={submit}
						footer={
							<Button
								className="broadcast-composer-action"
								variant="primary"
								processing={args.busy}
								disabled={!message.trim() || count === 0 || sent}
								type="submit"
							>
								Send to {count} agents
							</Button>
						}
					>
						<div className="broadcast-composer-fields">
							<Textarea
								label="Message"
								variant="composer"
								className="broadcast-composer-message"
								value={message}
								disabled={args.busy || sent}
								onChange={(event) => setMessage(event.target.value)}
							/>
							<div className="broadcast-composer-recipients">
								<Checkbox
									label="Working agents: 3"
									checked={working}
									disabled={args.busy || sent}
									onCheckedChange={setWorking}
								/>
								<Checkbox
									label="Idle agents: 2"
									checked={idle}
									disabled={args.busy || sent}
									onCheckedChange={setIdle}
								/>
							</div>
							{sent && (
								<p role="status" className="broadcast-composer-result">
									The local result records {count} recipients.
								</p>
							)}
							{args.children}
						</div>
					</BroadcastComposer>
				)}
			</>
		);
	},
} satisfies Meta<typeof BroadcastComposer>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Busy: Story = { args: { busy: true } };
export const Global: Story = { args: { scope: "All of Trellis" } };
export const LongScope: Story = {
	args: { scope: "The desktop release with a long name and many agents in different review steps" },
};
export const ErrorState: Story = {
	args: {
		children: (
			<FailureState
				title="The broadcast did not send"
				detail="The message does not reach one recipient."
				variant="section"
			/>
		),
	},
};
