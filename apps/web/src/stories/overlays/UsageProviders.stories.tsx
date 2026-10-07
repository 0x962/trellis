import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Provider } from "@trellis/api";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { UsageProviders } from "../../features/usage/UsagePage/components/UsageProviders";
import { at, failure, id, pending } from "./fixtures";
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
const searchProviders = async (context: { canvasElement: HTMLElement }, query: string) => {
	const search = within(context.canvasElement).getByRole("searchbox", { name: "Search providers" });
	await waitFor(() => expect(search).toBeEnabled());
	await fillField(context.canvasElement, "Search providers", query);
};
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
export const EditFocusReturn: Story = {
	play: async (context) => {
		await choose("Edit")(context);
		const body = within(context.canvasElement.ownerDocument.body);
		await body.findByRole("dialog");
		await userEvent.keyboard("{Escape}");
		await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
		await expect(body.getByRole("button", { name: "Actions for Catalog provider" })).toHaveFocus();
	},
};
export const RemoveFocusReturn: Story = {
	play: async (context) => {
		await choose("Remove")(context);
		const body = within(context.canvasElement.ownerDocument.body);
		await body.findByRole("dialog");
		await userEvent.keyboard("{Escape}");
		await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
		await expect(body.getByRole("button", { name: "Actions for Catalog provider" })).toHaveFocus();
	},
};
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
export const CheckError: Story = {
	parameters: { trellis: { responses: { "providers.check": failure } } },
	play: async ({ canvasElement }) => {
		const alert = await within(canvasElement).findByRole("alert");
		await expect(alert).toHaveTextContent("Trellis could not check the provider key");
		await expect(alert).toHaveTextContent("Select Check to try again.");
		await userEvent.click(within(alert).getByText("Details"));
		await expect(within(alert).getByText("The local fixture refuses this request.")).toBeVisible();
	},
};
export const CheckRefused: Story = {
	parameters: {
		trellis: {
			responses: {
				"providers.check": { ok: false, balance: null, detail: "The provider refused the key.", checkedAt: at },
			},
		},
	},
	play: async ({ canvasElement }) => {
		const alert = await within(canvasElement).findByRole("alert");
		await expect(alert).toHaveTextContent("The provider refused the key");
		await expect(alert).toHaveTextContent("Select Edit to replace the key.");
	},
};
export const CheckForbidden: Story = {
	parameters: {
		trellis: {
			responses: {
				"providers.check": { ok: false, balance: null, detail: "The provider refused the request.", checkedAt: at },
			},
		},
	},
};
export const LongFailure: Story = {
	parameters: {
		trellis: {
			responses: {
				"providers.list": [{ ...provider, name: "The shared model gateway for every desktop review agent" }],
				"providers.check": {
					ok: false,
					balance: null,
					detail: "Trellis cannot reach gateway-for-desktop-review-agents-in-the-development-region.example.test.",
					checkedAt: at,
				},
			},
		},
	},
};
export const DenseFailures: Story = {
	render: () => (
		<div className="h-screen overflow-y-auto">
			<UsageProviders />
		</div>
	),
	parameters: {
		trellis: {
			responses: {
				"providers.list": Array.from({ length: 40 }, (_, index) => ({
					...provider,
					id: id(100 + index),
					name: `Review gateway ${index + 1}`,
				})),
				"providers.check": { ok: false, balance: null, detail: "The provider refused the key.", checkedAt: at },
			},
		},
	},
};
export const SearchName: Story = {
	play: async (context) => {
		const canvas = within(context.canvasElement);
		const search = canvas.getByRole("searchbox", { name: "Search providers" });
		const before = search.getBoundingClientRect();
		await searchProviders(context, "CATALOG");
		await expect(canvas.getByRole("button", { name: "Edit Catalog provider · On" })).toBeVisible();
		await expect(search).toHaveFocus();
		await expect(search.getBoundingClientRect().toJSON()).toEqual(before.toJSON());
	},
};
export const SearchNoResults: Story = {
	play: async (context) => {
		await searchProviders(context, "No such provider");
		const canvas = within(context.canvasElement);
		await expect(canvas.getByRole("status")).toHaveTextContent("No matching providers");
		await expect(canvas.queryByText("No providers")).not.toBeInTheDocument();
		await expect(canvas.getByRole("button", { name: "Add provider" })).toBeEnabled();
	},
};
export const SearchClear: Story = {
	play: async (context) => {
		await searchProviders(context, "No such provider");
		const canvas = within(context.canvasElement);
		const search = canvas.getByRole("searchbox", { name: "Search providers" });
		await userEvent.keyboard("{Control>}a{/Control}{Backspace}");
		await expect(search).toHaveValue("");
		await expect(canvas.getByRole("button", { name: "Edit Catalog provider · On" })).toBeVisible();
		await expect(search).toHaveFocus();
	},
};
export const SearchKindAndState: Story = {
	parameters: {
		trellis: {
			responses: {
				"providers.list": [
					provider,
					{ ...provider, id: id(101), name: "Research lab", kind: "openai-compatible", enabled: false },
				],
			},
		},
	},
	play: async (context) => {
		await searchProviders(context, "openai off");
		const canvas = within(context.canvasElement);
		await expect(canvas.getByRole("button", { name: "Edit Research lab · Off" })).toBeVisible();
		await expect(canvas.queryByRole("button", { name: "Edit Catalog provider · On" })).not.toBeInTheDocument();
	},
};
export const DenseSearch: Story = {
	...DenseFailures,
	play: async (context) => {
		await searchProviders(context, "Review gateway 40");
		const canvas = within(context.canvasElement);
		await expect(canvas.getByRole("button", { name: "Edit Review gateway 40 · On" })).toBeVisible();
		await expect(canvas.getAllByRole("listitem")).toHaveLength(1);
	},
};
export const LongSearch: Story = {
	...LongFailure,
	play: async (context) => {
		await searchProviders(context, "desktop review");
		await expect(
			within(context.canvasElement).getByRole("button", {
				name: "Edit The shared model gateway for every desktop review agent · On",
			}),
		).toBeVisible();
	},
};
export const SearchEdit: Story = {
	play: async (context) => {
		await searchProviders(context, "Catalog");
		await choose("Edit")(context);
		const body = within(context.canvasElement.ownerDocument.body);
		await expect(await body.findByRole("dialog")).toHaveTextContent("Edit provider");
		await expect(body.getByLabelText("Name")).toHaveValue("Catalog provider");
		await userEvent.keyboard("{Escape}");
		await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
		await expect(body.getByRole("button", { name: "Actions for Catalog provider" })).toHaveFocus();
	},
};
export const Empty: Story = { parameters: { trellis: { responses: { "providers.list": [] } } } };
export const ListLoading: Story = { parameters: { trellis: { responses: { "providers.list": pending } } } };
export const ListError: Story = { parameters: { trellis: { responses: { "providers.list": failure } } } };
