import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChatterPanel } from "@trellis/ui";
import { useStoryState } from "../useStoryState";

const meta = {
	title: "Components/ChatterPanel",
	component: ChatterPanel,
	args: {
		epicName: "Desktop release",
		enabled: true,
		onEnabledChange: () => {},
		saving: false,
		readOnly: false,
		messages: [
			{
				id: "message-1",
				senderId: "agent-1",
				senderName: "Build agent",
				recipientId: "agent-2",
				recipientName: "Review agent",
				text: "The build checks pass.",
				state: "sent",
				createdAt: "2026-09-30T12:00:00Z",
			},
		],
		loading: false,
		error: null,
		onRetry: () => {},
		hasEarlier: false,
		loadingEarlier: false,
		onLoadEarlier: () => {},
	},
	render: function Render(args) {
		const [enabled, setEnabled] = useStoryState(args.enabled);
		return (
			<div className="h-100">
				<ChatterPanel {...args} enabled={enabled} onEnabledChange={setEnabled} />
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
