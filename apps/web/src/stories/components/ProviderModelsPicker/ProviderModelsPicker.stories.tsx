import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProviderModelsPicker } from "@trellis/ui";
import { expect, userEvent, waitFor, within } from "storybook/test";
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
					"Open the picker to search or type a model identifier. Enter selects it. Remove updates the selection. Refresh replaces stale fixture data.",
			},
		},
	},
	render: function Render(args) {
		const [value, setValue] = useStoryState(args.value);
		const [models, setModels] = useStoryState(args.models);
		const [fetchedAt, setFetchedAt] = useStoryState(args.fetchedAt);
		const [detail, setDetail] = useStoryState(args.detail);
		return (
			<ProviderModelsPicker
				{...args}
				value={value}
				onChange={setValue}
				models={models}
				fetchedAt={fetchedAt}
				detail={detail}
				onRefresh={() => {
					setModels([...args.models, { id: "local/review-model", name: "Review model" }]);
					setFetchedAt(new Date().toISOString());
					setDetail(null);
				}}
			/>
		);
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
export const RefreshModels: Story = {
	args: { fetchedAt: "2026-01-01T12:00:00Z", detail: "The model catalog does not load." },
	play: async ({ canvasElement }) => {
		await userEvent.click(within(canvasElement).getByRole("button", { name: "Choose provider models" }));
		const body = within(canvasElement.ownerDocument.body);
		await userEvent.click(await body.findByRole("button", { name: "Refresh models" }));
		await expect(body.queryByRole("button", { name: "Refresh models" })).not.toBeInTheDocument();
		await waitFor(() => expect(body.getByText("Review model")).toBeVisible());
	},
};
export const ManySelected: Story = {
	args: { value: Array.from({ length: 80 }, (_, index) => `local/model-${index + 1}`) },
};
