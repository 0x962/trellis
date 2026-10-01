import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProviderCard } from "@trellis/ui";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ProviderCardSection } from "../../../../../../packages/ui/src/gallery/components/DomainSections/sections/ProviderCardSection";
import { useStoryState } from "../useStoryState";

const meta = {
	title: "Components/ProviderCard",
	component: ProviderCard,
	args: {
		provider: {
			name: "Work gateway",
			kind: "vercel-ai-gateway",
			baseUrl: "https://gateway.example.test",
			keyLast4: "1234",
			enabled: true,
			models: ["openai/gpt-6-astra", "anthropic/claude-opus-5"],
		},
		checking: false,
		onEdit: () => {},
		onCheck: () => {},
		onToggle: () => {},
		onRemove: () => {},
	},
	parameters: {
		docs: {
			description: {
				component:
					"Use Add, Edit, and Remove to inspect local dialogs. The cards show balance, accepted, refused, forbidden, unreachable, disabled, and checking states.",
			},
		},
	},
	render: function Render(args) {
		const [enabled, setEnabled] = useStoryState(args.provider.enabled);
		return <ProviderCard {...args} provider={{ ...args.provider, enabled }} onToggle={() => setEnabled(!enabled)} />;
	},
} satisfies Meta<typeof ProviderCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const InteractiveStates: Story = { render: () => <ProviderCardSection /> };
export const Unchecked: Story = {};
export const Accepted: Story = { args: { check: { ok: true, balance: null, detail: null } } };
export const Balance: Story = { args: { check: { ok: true, balance: "95.50", detail: null } } };
export const Checking: Story = { args: { checking: true } };
export const Refused: Story = {
	args: { check: { ok: false, balance: null, detail: "The provider refused the key." } },
};
export const Forbidden: Story = {
	args: { check: { ok: false, balance: null, detail: "The provider refused the request." } },
};
export const ErrorState: Story = { args: { error: "The gateway is unavailable." } };
export const Disabled: Story = { args: { provider: { ...meta.args.provider, enabled: false } } };
export const Busy: Story = { args: { busy: true } };
export const EmptyModels: Story = { args: { provider: { ...meta.args.provider, models: [] } } };
export const OneModel: Story = { args: { provider: { ...meta.args.provider, models: ["local/model"] } } };
export const Compatible: Story = { args: { provider: { ...meta.args.provider, kind: "openai-compatible" } } };
export const Compact: Story = { args: { variant: "compact" } };
export const CompactChecking: Story = { args: { variant: "compact", checking: true } };
export const CompactError: Story = { args: { variant: "compact", error: "The gateway is unavailable." } };
export const CompactAccepted: Story = { args: { ...Balance.args, variant: "compact" } };
export const CompactRefused: Story = { args: { ...Refused.args, variant: "compact" } };
export const ActionsOpen: Story = {
	args: { variant: "compact" },
	play: async ({ canvasElement }) => {
		await userEvent.click(await within(canvasElement).findByRole("button", { name: "Actions for Work gateway" }));
		const action = await within(canvasElement.ownerDocument.body).findByRole("menuitem", { name: "Turn off" });
		await waitFor(() => expect(action).toBeVisible());
	},
};
export const LongContent: Story = {
	args: {
		provider: {
			...meta.args.provider,
			name: "The shared model gateway for every desktop review agent",
			models: Array.from({ length: 20 }, (_, index) => `review/model-${index + 1}`),
		},
	},
};
