import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Provider, ProviderModels } from "@trellis/api";
import { createRef } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
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
const accepted = { ok: true, balance: null, detail: null, checkedAt: at };
let finishDraftCheck: () => void;
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
				"providers.check": accepted,
				"providers.checkDraft": accepted,
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
const enterCredentials = async (context: { canvasElement: HTMLElement }) => {
	await fillField(context.canvasElement, "Name", "Catalog provider");
	await fillField(context.canvasElement, "API key", "storybook-placeholder-key");
};
const checkProvider = async (context: { canvasElement: HTMLElement }) => {
	await enterCredentials(context);
	const body = within(context.canvasElement.ownerDocument.body);
	await expect(body.getByRole("button", { name: "Add provider" })).toBeDisabled();
	await clickButton("Check provider")(context);
};
const submit = async (context: { canvasElement: HTMLElement }) => {
	await checkProvider(context);
	await within(context.canvasElement.ownerDocument.body).findByText(/Provider checked\./);
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
export const CheckPending: Story = {
	parameters: { trellis: { responses: { "providers.checkDraft": pending } } },
	play: checkProvider,
};
export const CheckRefused: Story = {
	parameters: {
		trellis: {
			responses: { "providers.checkDraft": { ...accepted, ok: false, detail: "The provider refused the key." } },
		},
	},
	play: async (context) => {
		await checkProvider(context);
		const body = within(context.canvasElement.ownerDocument.body);
		await expect(await body.findByRole("alert")).toHaveTextContent("The provider refused the key");
		await expect(body.getByLabelText("API key")).toHaveValue("storybook-placeholder-key");
		await expect(body.getByRole("button", { name: "Add provider" })).toBeDisabled();
	},
};
export const CheckError: Story = {
	parameters: { trellis: { responses: { "providers.checkDraft": failure } } },
	play: async (context) => {
		await checkProvider(context);
		const body = within(context.canvasElement.ownerDocument.body);
		await expect(await body.findByRole("alert")).toHaveTextContent("Trellis could not check the provider");
		await expect(body.getByLabelText("Name")).toHaveValue("Catalog provider");
		await expect(body.getByLabelText("API key")).toHaveValue("storybook-placeholder-key");
		await expect(body.getByRole("button", { name: "Add provider" })).toBeDisabled();
	},
};
export const CheckSuccess: Story = {
	play: async (context) => {
		await checkProvider(context);
		const body = within(context.canvasElement.ownerDocument.body);
		await body.findByText(/Provider checked\./);
		await expect(body.getByRole("button", { name: "Add provider" })).toBeEnabled();
	},
};
export const ChangedKey: Story = {
	play: async (context) => {
		await checkProvider(context);
		const body = within(context.canvasElement.ownerDocument.body);
		await body.findByText(/Provider checked\./);
		await fillField(context.canvasElement, "API key", "synthetic-new-key");
		await expect(body.getByRole("button", { name: "Add provider" })).toBeDisabled();
		await expect(body.getByText("Select Check provider before you save.")).toBeVisible();
	},
};
export const ChangedKind: Story = {
	play: async (context) => {
		await checkProvider(context);
		const body = within(context.canvasElement.ownerDocument.body);
		await body.findByText(/Provider checked\./);
		await userEvent.click(await body.findByRole("combobox", { name: "Provider kind" }));
		await userEvent.click(await body.findByRole("option", { name: "OpenAI-compatible" }));
		await expect(body.getByRole("button", { name: "Add provider" })).toBeDisabled();
		await expect(body.getByText("Select Check provider before you save.")).toBeVisible();
	},
};
export const StoredKey: Story = {
	args: { provider },
	parameters: { trellis: { responses: { "providers.checkDraft": failure } } },
	play: async (context) => {
		const body = within(context.canvasElement.ownerDocument.body);
		await fillField(context.canvasElement, "Name", "Renamed provider");
		await expect(body.getByRole("button", { name: "Save" })).toBeDisabled();
		await clickButton("Check provider")(context);
		await body.findByText(/Provider checked\./);
		await expect(body.getByLabelText("API key")).toHaveValue("");
		await expect(body.getByRole("button", { name: "Save" })).toBeEnabled();
	},
};
export const ChangedAddress: Story = {
	args: { provider: { ...provider, kind: "openai-compatible", baseUrl: "https://models.example.test" } },
	play: async (context) => {
		const body = within(context.canvasElement.ownerDocument.body);
		await fillField(context.canvasElement, "Name", "Renamed provider");
		await clickButton("Check provider")(context);
		await body.findByText(/Provider checked\./);
		await fillField(context.canvasElement, "Address", "https://new.example.test");
		await expect(body.getByRole("button", { name: "Save" })).toBeDisabled();
		await expect(body.getByRole("button", { name: "Check provider" })).toBeDisabled();
		await expect(body.getByText("Enter the API key to check the new address.")).toBeVisible();
		await fillField(context.canvasElement, "API key", "synthetic-new-key");
		await clickButton("Check provider")(context);
		await body.findByText(/Provider checked\./);
		await expect(body.getByRole("button", { name: "Save" })).toBeEnabled();
	},
};
export const ChangedDuringCheck: Story = {
	parameters: {
		trellis: {
			responses: {
				"providers.checkDraft": () =>
					new Promise((resolve) => {
						finishDraftCheck = () => resolve(accepted);
					}),
			},
		},
	},
	play: async (context) => {
		await checkProvider(context);
		const body = within(context.canvasElement.ownerDocument.body);
		await body.findByText("Check in progress. Your values stay in this form.");
		await fillField(context.canvasElement, "API key", "synthetic-new-key");
		finishDraftCheck();
		await new Promise(requestAnimationFrame);
		await waitFor(() => expect(body.getByRole("button", { name: "Add provider" })).toBeDisabled());
		await expect(body.getByText("Select Check provider before you save.")).toBeVisible();
		await expect(body.getByLabelText("API key")).toHaveValue("synthetic-new-key");
	},
};
