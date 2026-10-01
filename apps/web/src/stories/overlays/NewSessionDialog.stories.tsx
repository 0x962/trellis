import { Plus } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { IconButton, Tooltip } from "@trellis/ui";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { NewSessionDialog } from "../../features/sessions/NewSessionDialog";
import { NewSessionHost } from "../../features/sessions/NewSessionHost";
import { sessionComposerActions } from "../../features/sessions/sessionComposerStore";
import { failure, noop, pending, responses, run, session } from "./fixtures";
import { clickButton, fillField } from "./interactions";

const meta = {
	title: "Overlays/NewSessionDialog",
	component: NewSessionDialog,
	args: { onClose: noop },
	beforeEach: (context) => {
		sessionComposerActions.clear();
		if (!context.parameters.closed) sessionComposerActions.open();
	},
	parameters: { trellis: { responses: { ...responses, "sessions.create": { ...session, run } } } },
	render: () => (
		<>
			<Tooltip content="New session">
				<IconButton label="New session" icon={<Plus />} onClick={() => sessionComposerActions.open()} />
			</Tooltip>
			<NewSessionHost />
		</>
	),
} satisfies Meta<typeof NewSessionDialog>;
export default meta;
type Story = StoryObj<typeof meta>;
const submit = async (context: { canvasElement: HTMLElement }) => {
	await fillField(context.canvasElement, "Prompt", "Inspect the component catalog.");
	await clickButton("Start session")(context);
};
export const Open: Story = {};
export const ClosedTrigger: Story = { parameters: { closed: true } };
export const Selected: Story = {
	beforeEach: () => {
		sessionComposerActions.clear();
		sessionComposerActions.open("DEMO");
		sessionComposerActions.change({ project: "DEMO", name: "Catalog review", prompt: "Review every control." });
	},
};
export const Empty: Story = {
	parameters: { trellis: { responses: { "projects.list": [], "harnessAccounts.list": [] } } },
};
export const Loading: Story = {
	parameters: { trellis: { responses: { "projects.list": pending, "harnessAccounts.list": pending } } },
};
export const Pending: Story = {
	parameters: { trellis: { responses: { "sessions.create": pending } } },
	play: async (context) => {
		await submit(context);
		const body = within(context.canvasElement.ownerDocument.body);
		await waitFor(() => expect(body.getByRole("button", { name: "Start session" })).toBeDisabled());
		await expect(body.getByRole("textbox", { name: "Prompt" })).toBeDisabled();
		await expect(body.getByRole("button", { name: "Close and keep draft" })).toBeDisabled();
	},
};
export const RequestError: Story = {
	parameters: { trellis: { responses: { "sessions.create": failure } } },
	play: async (context) => {
		await submit(context);
		const body = within(context.canvasElement.ownerDocument.body);
		await expect(await body.findByText("The session could not be created.")).toBeVisible();
		await expect(body.getByRole("textbox", { name: "Prompt" })).toHaveValue("Inspect the component catalog.");
	},
};
export const Success: Story = {
	play: async (context) => {
		await submit(context);
		await waitFor(() =>
			expect(
				within(context.canvasElement.ownerDocument.body).queryByRole("dialog", { name: "New session" }),
			).not.toBeInTheDocument(),
		);
	},
};
export const ProjectPicker: Story = { play: clickButton("Project: No project") };
export const AgentPicker: Story = { play: clickButton(/^Agent: Claude/) };
export const ChangeProject: Story = {
	play: async (context) => {
		const body = within(context.canvasElement.ownerDocument.body);
		await clickButton("Project: No project")(context);
		await userEvent.click(await body.findByRole("option", { name: "DEMO" }));
		await clickButton("Project: DEMO")(context);
		await userEvent.click(await body.findByRole("option", { name: "No project" }));
		await expect(await body.findByRole("button", { name: "Project: No project" })).toBeVisible();
	},
};
export const ChangeAgent: Story = {
	play: async (context) => {
		await clickButton(/^Agent: Claude/)(context);
		await fillField(context.canvasElement, "Search agents and models", "Codex default");
		const body = within(context.canvasElement.ownerDocument.body);
		await userEvent.click(await body.findByRole("option", { name: "Codex default" }));
		await expect(await body.findByRole("button", { name: /^Agent: Codex/ })).toBeVisible();
	},
};
export const RetainedDraft: Story = {
	play: async (context) => {
		await fillField(context.canvasElement, "Session name", "Catalog review");
		await fillField(context.canvasElement, "Prompt", "Review every control.");
		await clickButton("Close and keep draft")(context);
		const body = within(context.canvasElement.ownerDocument.body);
		await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
		await clickButton("New session")(context);
		await expect(await body.findByRole("textbox", { name: "Session name" })).toHaveValue("Catalog review");
		await expect(body.getByRole("textbox", { name: "Prompt" })).toHaveValue("Review every control.");
	},
};
export const Attachment: Story = {
	play: async (context) => {
		const body = within(context.canvasElement.ownerDocument.body);
		await body.findByRole("button", { name: "Add attachment" });
		await userEvent.upload(
			context.canvasElement.ownerDocument.querySelector<HTMLInputElement>('input[type="file"].hidden')!,
			new File(["Catalog notes"], "catalog.txt", { type: "text/plain" }),
		);
		await expect(await body.findByText("catalog.txt")).toBeVisible();
		await waitFor(() => expect(body.getByRole("button", { name: "Start session" })).toBeEnabled());
		await clickButton("Remove catalog.txt")(context);
		await waitFor(() => expect(body.getByRole("button", { name: "Start session" })).toBeDisabled());
	},
};
