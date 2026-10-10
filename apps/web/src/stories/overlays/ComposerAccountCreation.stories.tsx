import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { ComposerHost } from "../../features/composer/ComposerHost";
import { submissionKey } from "../../features/composer/hooks/useComposerSubmission/useComposerSubmission";
import composerMeta from "./CreateTicketDialog.stories";
import { accounts, ticket } from "./fixtures";

const account = { ...accounts[0]!, id: "01M00000000000000000000999", name: "New work" };
let created = false;
const createTicket = fn(async () => ticket);
const meta = {
	...composerMeta,
	title: "Overlays/ComposerAccountCreation",
	component: ComposerHost,
	parameters: {
		...composerMeta.parameters,
		draft: { assignment: { preset: "claude", model: null, effort: null, accountId: null } },
		trellis: {
			...composerMeta.parameters.trellis,
			responses: {
				...composerMeta.parameters.trellis.responses,
				"tickets.create": createTicket,
				"harnessAccounts.list": () => (created ? [...accounts, account] : accounts),
				"harnessAccounts.create": () => {
					created = true;
					return account;
				},
			},
		},
	},
	beforeEach: (context) => {
		created = false;
		createTicket.mockClear();
		sessionStorage.removeItem(submissionKey);
		composerMeta.beforeEach(context);
	},
} satisfies Meta<typeof ComposerHost>;
export default meta;
type Story = StoryObj<typeof meta>;

const createAccount =
	(shortcut?: string): NonNullable<Story["play"]> =>
	async ({ canvasElement }) => {
		const page = within(canvasElement.ownerDocument.body);
		await userEvent.click(await page.findByRole("button", { name: /^Agent: Claude/ }));
		await userEvent.click(await page.findByRole("button", { name: "Account" }));
		await userEvent.type(await page.findByRole("combobox", { name: "Search accounts" }), "New work");
		await userEvent.click(await page.findByRole("option", { name: 'Create account "New work"' }));
		const form = within(await page.findByRole("dialog", { name: "Add agent account" }));
		await expect(form.getByRole("textbox", { name: "Account name" })).toHaveValue("New work");
		await userEvent.click(form.getByRole("textbox", { name: "Account name" }));
		if (shortcut) await userEvent.keyboard(shortcut);
		if (!shortcut || shortcut.startsWith("{Control")) {
			await expect(createTicket).not.toHaveBeenCalled();
			await userEvent.click(form.getByRole("button", { name: "Add account" }));
		}
		await waitFor(() => expect(page.queryByRole("dialog", { name: "Add agent account" })).not.toBeInTheDocument());
		await expect(createTicket).not.toHaveBeenCalled();
		await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue("Build the component catalog");
		await expect(page.getByRole("button", { name: "Account" })).toHaveTextContent("New work");
	};

export const CreateKeepsTicketDraft: Story = { play: createAccount() };
export const MetaEnterKeepsTicketDraft: Story = { play: createAccount("{Meta>}{Enter}{/Meta}") };
export const ControlEnterKeepsTicketDraft: Story = { play: createAccount("{Control>}{Enter}{/Control}") };
