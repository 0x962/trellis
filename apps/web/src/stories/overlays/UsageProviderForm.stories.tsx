import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Provider, ProviderModels } from "@trellis/api";
import { createRef } from "react";
import { expect, within } from "storybook/test";
import { UsageProviderForm } from "../../features/usage/UsagePage/components/UsageProviders/components/UsageProviderForm";
import { OverlayTrigger } from "./components/OverlayTrigger";
import { at, failure, id, noop, pending } from "./fixtures";
import { clickButton, fillField } from "./interactions";

const provider: Provider = {
	id: id(100),
	name: "Catalog provider",
	kind: "vercel-ai-gateway",
	baseUrl: "https://ai-gateway.vercel.sh",
	keyLast4: "demo",
	enabled: true,
	models: ["anthropic/claude-opus-5"],
	createdAt: at,
	updatedAt: at,
};
const catalog: ProviderModels = {
	ok: true,
	detail: null,
	fetchedAt: at,
	models: [
		{ id: "anthropic/claude-opus-5", name: "Claude Opus 5", type: "language" },
		{ id: "openai/gpt-5.4", name: "GPT-5.4", type: "language" },
	],
};
const meta = {
	title: "Overlays/UsageProviderForm",
	component: UsageProviderForm,
	args: { onClose: noop, onSaved: async () => {}, finalFocus: createRef<HTMLButtonElement>() },
	parameters: {
		trellis: {
			responses: {
				"providers.publicModels": catalog,
				"providers.models": catalog,
				"providers.create": provider,
				"providers.update": provider,
			},
		},
	},
	render: (args, context) => (
		<OverlayTrigger label="Add provider" initiallyOpen={!context.parameters.closed}>
			{(close) => <UsageProviderForm {...args} onClose={close} />}
		</OverlayTrigger>
	),
} satisfies Meta<typeof UsageProviderForm>;
export default meta;
type Story = StoryObj<typeof meta>;
const submit = async (context: { canvasElement: HTMLElement }) => {
	await fillField(context.canvasElement, "Name", "Catalog provider");
	await fillField(context.canvasElement, "API key", "storybook-placeholder-key");
	await clickButton("Add provider")(context);
};
export const Open: Story = {};
export const ClosedTrigger: Story = { parameters: { closed: true } };
export const Selected: Story = { args: { provider } };
export const Disabled: Story = { args: { provider: { ...provider, enabled: false } } };
export const CompatibleEndpoint: Story = {
	args: { provider: { ...provider, kind: "openai-compatible", baseUrl: "https://models.example.test" } },
};
export const ModelsOpen: Story = { play: clickButton("Choose provider models") };
export const ModelsEmpty: Story = {
	parameters: { trellis: { responses: { "providers.publicModels": { ...catalog, models: [] } } } },
	play: clickButton("Choose provider models"),
};
export const ModelsLoading: Story = {
	parameters: { trellis: { responses: { "providers.publicModels": pending } } },
	play: clickButton("Choose provider models"),
};
export const ModelsError: Story = {
	parameters: { trellis: { responses: { "providers.publicModels": failure } } },
	play: clickButton("Choose provider models"),
};
export const Pending: Story = { parameters: { trellis: { responses: { "providers.create": pending } } }, play: submit };
export const RequestError: Story = {
	parameters: { trellis: { responses: { "providers.create": failure } } },
	play: async (context) => {
		await submit(context);
		const dialog = within(await within(context.canvasElement.ownerDocument.body).findByRole("dialog"));
		await expect(await dialog.findByRole("alert")).toHaveTextContent("The local fixture refuses this request.");
		await expect(dialog.getByRole("textbox", { name: "Name" })).toHaveValue("Catalog provider");
		await expect(dialog.getByLabelText("API key")).toHaveValue("storybook-placeholder-key");
	},
};
export const Success: Story = { play: submit };
