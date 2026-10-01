import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChatterPanel, type ChatterPanelProps } from "@trellis/ui";
import { expect, userEvent, within } from "storybook/test";
import { useStoryState } from "../useStoryState";

const message: ChatterPanelProps["messages"][number] = {
	id: "message-1",
	senderId: "agent-1",
	senderName: "Build agent",
	recipientId: "agent-2",
	recipientName: "Review agent",
	text: "The build checks pass.",
	state: "sent",
	createdAt: "2026-09-30T12:00:00Z",
};

const meta = {
	title: "Components/ChatterPanel",
	component: ChatterPanel,
	args: {
		epicName: "Desktop release",
		enabled: true,
		onEnabledChange: () => {},
		saving: false,
		readOnly: false,
		messages: [message],
		loading: false,
		error: null,
		onRetry: () => {},
		hasEarlier: false,
		loadingEarlier: false,
		onLoadEarlier: () => {},
	},
	parameters: {
		docs: {
			description: {
				component:
					"The switch updates local settings. Reload restores fixture messages. Load earlier messages adds a prior day to the history.",
			},
		},
	},
	render: function Render(args) {
		const [enabled, setEnabled] = useStoryState(args.enabled);
		const [messages, setMessages] = useStoryState(args.messages);
		const [error, setError] = useStoryState(args.error);
		const [hasEarlier, setHasEarlier] = useStoryState(args.hasEarlier);
		return (
			<div className="h-100">
				<ChatterPanel
					{...args}
					enabled={enabled}
					onEnabledChange={setEnabled}
					messages={messages}
					error={error}
					hasEarlier={hasEarlier}
					onRetry={() => {
						setError(null);
						setMessages([message]);
					}}
					onLoadEarlier={() => {
						setMessages([
							{
								...message,
								id: "message-0",
								text: "The agent prepares the release checks.",
								createdAt: "2026-09-29T12:00:00Z",
							},
							...messages,
						]);
						setHasEarlier(false);
					}}
				/>
			</div>
		);
	},
} satisfies Meta<typeof ChatterPanel>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { messages: [] } };
export const Loading: Story = { args: { messages: [], loading: true, enabled: undefined } };
export const ErrorState: Story = { args: { error: "The messages do not load." } };
export const Disabled: Story = { args: { enabled: false } };
export const ReadOnly: Story = { args: { readOnly: true } };
export const Saving: Story = { args: { saving: true } };
export const EarlierMessages: Story = { args: { hasEarlier: true } };
export const LoadingEarlier: Story = { args: { hasEarlier: true, loadingEarlier: true } };
export const RetryMessages: Story = {
	args: { messages: [], error: "The messages do not load." },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole("button", { name: "Reload Chatter" }));
		await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
		await expect(canvas.getByRole("list", { name: "Agent messages" }).children).toHaveLength(1);
	},
};
export const LoadEarlierMessages: Story = {
	args: { hasEarlier: true },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole("button", { name: "Load earlier messages" }));
		await expect(canvas.getByText("The agent prepares the release checks.")).toBeVisible();
		await expect(canvas.queryByRole("button", { name: "Load earlier messages" })).not.toBeInTheDocument();
	},
};
export const DeliveryStates: Story = {
	args: {
		messages: (["pending", "sent", "queued", "skipped", "unconfirmed"] as const).map((state, index) => ({
			id: `message-${index}`,
			senderId: "agent-1",
			senderName: "Build agent",
			recipientId: "agent-2",
			recipientName: "Review agent",
			text: `Delivery state: ${state}`,
			state,
			createdAt: "2026-09-30T12:00:00Z",
		})),
	},
};
export const LongMessage: Story = {
	args: {
		messages: [
			{
				id: "long",
				senderId: "agent-1",
				senderName: "Build agent",
				recipientId: "agent-2",
				recipientName: "Review agent",
				text: "The build checks pass. ".repeat(80),
				state: "sent",
				createdAt: "2026-09-30T12:00:00Z",
			},
		],
	},
};
