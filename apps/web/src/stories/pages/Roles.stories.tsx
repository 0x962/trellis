import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Role, RoleCreateInput } from "@trellis/api";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { RolesPage } from "../../features/roles/RolesPage";
import { failure, id, pending } from "./fixtures/project";
import { pageFrame } from "./pageFrame";

const role: Role = {
	id: id(1700),
	name: "Reviewer",
	body: "# Review\n\nCheck the change.\n\n",
	createdAt: "2026-10-10T16:00:00Z",
	updatedAt: "2026-10-10T16:00:00Z",
};
let stored: Role[] = [];
const responses = {
	"roles.list": () => stored,
	"roles.create": (input: RoleCreateInput) => {
		const created = { ...role, ...input, id: id(1701) };
		stored = [...stored, created];
		return created;
	},
	"roles.update": (input: { id: string; name?: string; body?: string }) => {
		stored = stored.map((item) => (item.id === input.id ? { ...item, ...input } : item));
		return stored.find((item) => item.id === input.id)!;
	},
	"roles.delete": (input: { id: string }) => {
		stored = stored.filter((item) => item.id !== input.id);
		return input;
	},
};
const meta = {
	title: "Pages/Roles",
	component: RolesPage,
	decorators: [pageFrame],
	parameters: { layout: "fullscreen", trellis: { path: "/agents/roles", responses } },
	beforeEach: () => {
		stored = [{ ...role }];
	},
} satisfies Meta<typeof RolesPage>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Populated: Story = {};
export const Empty: Story = {
	beforeEach: () => {
		stored = [];
	},
};
export const Loading: Story = { parameters: { trellis: { responses: { "roles.list": pending } } } };
export const RequestError: Story = { parameters: { trellis: { responses: { "roles.list": failure } } } };
export const Narrow: Story = { globals: { viewport: { value: "narrow", isRotated: false } } };
export const CreateEditDelete: Story = {
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const page = within(canvasElement.ownerDocument.body);
		await userEvent.click(await canvas.findByRole("button", { name: "New role" }));
		let sheet = within(await page.findByRole("dialog", { name: "New role" }));
		await userEvent.type(sheet.getByRole("textbox", { name: "Name" }), "Writer");
		const body = await sheet.findByRole("textbox", { name: "Body" });
		await userEvent.click(body);
		await userEvent.type(body, "Write a clear result.");
		await userEvent.click(sheet.getByRole("button", { name: "Create role" }));
		await userEvent.click(await canvas.findByRole("button", { name: "Edit Writer" }));
		sheet = within(await page.findByRole("dialog", { name: "Edit role" }));
		await expect(await sheet.findByRole("textbox", { name: "Body" })).toHaveTextContent("Write a clear result.");
		await userEvent.clear(sheet.getByRole("textbox", { name: "Name" }));
		await userEvent.type(sheet.getByRole("textbox", { name: "Name" }), "Editor");
		await userEvent.click(sheet.getByRole("button", { name: "Save changes" }));
		await userEvent.click(await canvas.findByRole("button", { name: "Edit Editor" }));
		sheet = within(await page.findByRole("dialog", { name: "Edit role" }));
		await userEvent.click(sheet.getByRole("button", { name: "Delete role" }));
		const confirmation = within(await page.findByRole("dialog", { name: "Delete role?" }));
		await userEvent.click(confirmation.getByRole("button", { name: "Delete role" }));
		await waitFor(() => expect(canvas.queryByRole("button", { name: "Edit Editor" })).not.toBeInTheDocument());
		await userEvent.click(canvas.getByRole("button", { name: "Edit Reviewer" }));
		sheet = within(await page.findByRole("dialog", { name: "Edit role" }));
		await sheet.findByRole("textbox", { name: "Body" });
		await expect(sheet.getByRole("button", { name: "Save changes" })).toBeDisabled();
		await userEvent.type(sheet.getByRole("textbox", { name: "Name" }), " revised");
		await userEvent.click(sheet.getByRole("button", { name: "Save changes" }));
		await canvas.findByRole("button", { name: "Edit Reviewer revised" });
		await expect(stored.find((item) => item.id === role.id)?.body).toBe(role.body);
	},
};
