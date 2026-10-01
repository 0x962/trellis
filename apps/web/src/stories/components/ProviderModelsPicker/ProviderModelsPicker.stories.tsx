import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProviderModelsPicker } from "@trellis/ui";
import { useStoryState } from "../useStoryState";

const meta = {
	title: "Components/ProviderModelsPicker",
	component: ProviderModelsPicker,
	args: {
		value: ["openai/gpt-6-astra"],
		onChange: () => {},
		models: [
			{ id: "openai/gpt-6-astra", name: "GPT-6 Astra" },
			{ id: "anthropic/claude-opus-5", name: "Claude Opus 5" },
		],
		validId: (value) => value.length > 0 && !/\s/u.test(value),
		onRefresh: () => {},
	},
	parameters: {
		docs: {
			description: {
				component:
					"Open the picker to search or type a model identifier. Enter selects it. Remove actions update the local selection.",
			},
		},
	},
	render: function Render(args) {
		const [value, setValue] = useStoryState(args.value);
		return <ProviderModelsPicker {...args} value={value} onChange={setValue} />;
	},
} satisfies Meta<typeof ProviderModelsPicker>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = { args: { value: [], models: [] } };
export const Loading: Story = { args: { pending: true } };
export const Disabled: Story = { args: { disabled: true } };
export const ErrorState: Story = { args: { detail: "The model catalog does not load." } };
export const TypedOnly: Story = { args: { typedOnly: true, models: [] } };
export const Stale: Story = { args: { fetchedAt: "2026-01-01T12:00:00Z" } };
export const ManySelected: Story = {
	args: { value: Array.from({ length: 80 }, (_, index) => `local/model-${index + 1}`) },
};
