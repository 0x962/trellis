import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProviderCard } from "@trellis/ui";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ProviderCardSection } from "../../../../../../packages/ui/src/gallery/components/DomainSections/sections/ProviderCardSection";
import { ProviderCardExample } from "./components/ProviderCardExample";

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
					"Edit, check, toggle, and remove update a local provider. InteractiveStates also shows the gallery of provider states and the Add form.",
			},
		},
	},
	render: (args) => <ProviderCardExample {...args} />,
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
export const CompactForbidden: Story = { args: { ...Forbidden.args, variant: "compact" } };
export const CompactFailurePending: Story = {
	args: { ...Refused.args, variant: "compact", checking: true },
};
export const CompactFailureRecovery: Story = {
	args: { ...Refused.args, variant: "compact" },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByRole("alert")).toHaveTextContent("Select Edit to replace the key.");
		await userEvent.click(canvas.getByRole("button", { name: "Check Work gateway" }));
		await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
		await expect(canvas.getByText("Key accepted · $95.50 left · 2 models")).toBeVisible();
	},
};
export const CompactLongFailure: Story = {
	args: {
		variant: "compact",
		provider: { ...meta.args.provider, name: "The shared model gateway for every desktop review agent" },
		check: {
			ok: false,
			balance: null,
			detail: "Trellis cannot reach gateway-for-desktop-review-agents-in-the-development-region.example.test.",
		},
	},
};
export const ActionsOpen: Story = {
	args: { variant: "compact" },
	play: async ({ canvasElement }) => {
		await userEvent.click(await within(canvasElement).findByRole("button", { name: "Actions for Work gateway" }));
		const action = await within(canvasElement.ownerDocument.body).findByRole("menuitem", { name: "Turn off" });
		await waitFor(() => expect(action).toBeVisible());
	},
};
export const CheckKey: Story = {
	args: { error: "The gateway is unavailable." },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole("button", { name: "Check the key of Work gateway" }));
		const provider = within(canvas.getByRole("article", { name: "Work gateway" }));
		await expect(provider.getByRole("status")).toHaveTextContent("Key accepted");
	},
};
export const EditProvider: Story = {
	play: async ({ canvasElement }) => {
		await userEvent.click(within(canvasElement).getByRole("button", { name: "Edit Work gateway" }));
		const body = within(canvasElement.ownerDocument.body);
		const name = await body.findByRole("textbox", { name: "Name" });
		await userEvent.clear(name);
		await userEvent.type(name, "Review gateway");
		await userEvent.click(body.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
		await expect(within(canvasElement).getByRole("article", { name: "Review gateway" })).toBeVisible();
	},
};
export const RemoveProvider: Story = {
	play: async ({ canvasElement }) => {
		await userEvent.click(within(canvasElement).getByRole("button", { name: "Remove Work gateway" }));
		const body = within(canvasElement.ownerDocument.body);
		await userEvent.click(await body.findByRole("button", { name: "Remove provider" }));
		await expect(within(canvasElement).getByText("No local provider")).toBeVisible();
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
