import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Provider } from "@trellis/api";
import { userEvent, within } from "storybook/test";
import { UsageProviders } from "../../features/usage/UsagePage/components/UsageProviders";
import { at, failure, id, pending } from "./fixtures";
import { clickButton } from "./interactions";

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
const meta = {
	title: "Overlays/UsageProviders",
	component: UsageProviders,
	parameters: {
		trellis: {
			responses: {
				"providers.list": [provider],
				"providers.check": { ok: true, balance: "25.00", detail: null, checkedAt: at },
				"providers.delete": { deleted: true },
				"providers.update": { ...provider, enabled: false },
				"providers.models": { ok: true, detail: null, fetchedAt: at, models: [] },
			},
		},
	},
} satisfies Meta<typeof UsageProviders>;
export default meta;
type Story = StoryObj<typeof meta>;
const menu = clickButton("Actions for Catalog provider");
const choose = (name: string) => async (context: { canvasElement: HTMLElement }) => {
	await menu(context);
	await userEvent.click(await within(context.canvasElement.ownerDocument.body).findByRole("menuitem", { name }));
};
const remove = async (context: { canvasElement: HTMLElement }) => {
	await choose("Remove")(context);
	await clickButton("Remove provider")(context);
};
export const ClosedTrigger: Story = {};
export const Open: Story = { play: menu };
export const Disabled: Story = {
	parameters: { trellis: { responses: { "providers.list": [{ ...provider, enabled: false }] } } },
	play: menu,
};
export const Edit: Story = { play: choose("Edit") };
export const RemoveConfirmation: Story = { play: choose("Remove") };
export const RemovePending: Story = {
	parameters: { trellis: { responses: { "providers.delete": pending } } },
	play: remove,
};
export const RemoveError: Story = {
	parameters: { trellis: { responses: { "providers.delete": failure } } },
	play: remove,
};
export const RemoveSuccess: Story = { play: remove };
export const TogglePending: Story = {
	parameters: { trellis: { responses: { "providers.update": pending } } },
	play: choose("Turn off"),
};
export const ToggleError: Story = {
	parameters: { trellis: { responses: { "providers.update": failure } } },
	play: choose("Turn off"),
};
export const CheckLoading: Story = { parameters: { trellis: { responses: { "providers.check": pending } } } };
export const CheckError: Story = { parameters: { trellis: { responses: { "providers.check": failure } } } };
export const Empty: Story = { parameters: { trellis: { responses: { "providers.list": [] } } } };
export const ListLoading: Story = { parameters: { trellis: { responses: { "providers.list": pending } } } };
export const ListError: Story = { parameters: { trellis: { responses: { "providers.list": failure } } } };
