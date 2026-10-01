import { Plus } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { IconButton, ProviderForm, ProviderModelsPicker, Tooltip } from "@trellis/ui";
import { useStoryState } from "../useStoryState";

const meta = {
	title: "Components/ProviderForm",
	component: ProviderForm,
	args: {
		open: true,
		value: {
			name: "Work gateway",
			kind: "vercel-ai-gateway",
			baseUrl: "",
			apiKey: "sample-key",
			models: [],
			enabled: true,
		},
		onChange: () => {},
		busy: false,
		valid: true,
		models: () => null,
		onClose: () => {},
		onSubmit: () => {},
	},
	render: function Render(args) {
		const [open, setOpen] = useStoryState(args.open);
		const [value, setValue] = useStoryState(args.value);
		return (
			<>
				<Tooltip content="Edit provider">
					<IconButton label="Edit provider" icon={<Plus />} onClick={() => setOpen(true)} />
				</Tooltip>
				<ProviderForm
					{...args}
					open={open}
					value={value}
					onChange={setValue}
					valid={args.valid && value.name.length > 0}
					onClose={() => setOpen(false)}
					onSubmit={() => setOpen(false)}
					models={(id) => (
						<ProviderModelsPicker
							id={id}
							value={value.models}
							onChange={(models) => setValue({ ...value, models })}
							models={[{ id: "openai/gpt-6-astra", name: "GPT-6 Astra" }]}
							validId={(model) => model.length > 0 && !/\s/u.test(model)}
							onRefresh={() => {}}
							disabled={args.busy}
						/>
					)}
				/>
			</>
		);
	},
} satisfies Meta<typeof ProviderForm>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Empty: Story = {
	args: {
		value: { name: "", kind: "vercel-ai-gateway", baseUrl: "", apiKey: "", models: [], enabled: true },
		valid: false,
	},
};
export const Edit: Story = { args: { editing: true, keyLast4: "1234", value: { ...meta.args.value, apiKey: "" } } };
export const EditWithoutKeySuffix: Story = { args: { editing: true, value: { ...meta.args.value, apiKey: "" } } };
export const Busy: Story = { args: { busy: true } };
export const ErrorState: Story = { args: { error: "The provider name already exists.", errorField: "name" } };
export const KeyError: Story = { args: { error: "The provider rejects this key.", errorField: "apiKey" } };
export const RequestError: Story = { args: { error: "The provider does not save." } };
export const DisabledProvider: Story = { args: { value: { ...meta.args.value, enabled: false } } };
export const Compatible: Story = {
	args: {
		value: {
			name: "Local gateway",
			kind: "openai-compatible",
			baseUrl: "https://gateway.example.test",
			apiKey: "sample-key",
			models: ["local/model"],
			enabled: true,
		},
	},
};
export const AddressError: Story = {
	args: { ...Compatible.args, error: "The address does not identify a model gateway.", errorField: "baseUrl" },
};
