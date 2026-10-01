import { Plus } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { IconButton, Tooltip } from "@trellis/ui";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ComposerHost } from "../../features/composer/ComposerHost";
import { composerActions } from "../../features/composer/composerStore";
import { type ComposerDraft, draftKey } from "../../features/composer/hooks/useComposerDraft/useComposerDraft";
import { epic, failure, pending, responses, run, ticket, wave } from "./fixtures";
import { clickButton } from "./interactions";

const draft: ComposerDraft = {
	title: "Build the component catalog",
	description: "Cover each mounted control.",
	project: "DEMO",
	epic: epic.ref,
	wave: wave.ref,
	assignment: null,
	priority: "none",
	automatic: [],
};
const meta = {
	title: "Overlays/CreateTicketDialog",
	component: ComposerHost,
	parameters: {
		trellis: {
			path: "/p/DEMO",
			responses: {
				...responses,
				"tickets.create": ticket,
				"agentRuns.start": run,
				"tickets.classify": { priority: "high", epic: epic.ref, wave: wave.ref, model: null },
			},
		},
	},
	beforeEach: (context) => {
		composerActions.setAssignAgent(context.parameters.assignAgent ?? true);
		composerActions.setCreateMore(context.parameters.createMore ?? false);
		sessionStorage.setItem(
			draftKey,
			JSON.stringify(
				context.parameters.empty ? { ...draft, title: "", description: "" } : { ...draft, ...context.parameters.draft },
			),
		);
		if (context.parameters.closed) composerActions.close();
		else composerActions.open(context.parameters.options ?? { project: "DEMO", epic: epic.ref, wave: wave.ref });
	},
	render: () => (
		<>
			<Tooltip content="New ticket">
				<IconButton
					label="New ticket"
					icon={<Plus />}
					onClick={() => composerActions.open({ project: "DEMO", epic: epic.ref, wave: wave.ref })}
				/>
			</Tooltip>
			<ComposerHost />
		</>
	),
} satisfies Meta<typeof ComposerHost>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Open: Story = {};
export const ClosedTrigger: Story = { parameters: { closed: true } };
export const Empty: Story = {
	parameters: { empty: true },
	play: async ({ canvasElement }) => {
		await expect(
			await within(canvasElement.ownerDocument.body).findByRole("button", { name: "Create" }),
		).toBeDisabled();
	},
};
export const Loading: Story = { parameters: { trellis: { responses: { "epics.list": pending } } } };
export const PlacementError: Story = { parameters: { trellis: { responses: { "epics.list": failure } } } };
export const Pending: Story = {
	parameters: { trellis: { responses: { "tickets.create": pending } } },
	play: async (context) => {
		await clickButton("Create")(context);
		const body = within(context.canvasElement.ownerDocument.body);
		await expect(await body.findByRole("button", { name: "Creating…" })).toBeDisabled();
		await expect(body.getByLabelText("Title")).toBeDisabled();
	},
};
export const RequestError: Story = {
	parameters: { trellis: { responses: { "tickets.create": failure } } },
	play: async (context) => {
		await clickButton("Create")(context);
		await expect(
			await within(context.canvasElement.ownerDocument.body).findByRole("heading", {
				name: "The ticket did not save.",
			}),
		).toBeVisible();
	},
};
export const Success: Story = {
	play: async (context) => {
		await clickButton("Create")(context);
		await waitFor(() =>
			expect(
				within(context.canvasElement.ownerDocument.body).queryByRole("dialog", { name: "New ticket" }),
			).not.toBeInTheDocument(),
		);
	},
};
export const AgentPicker: Story = { play: clickButton("Assign agent") };
export const PlacementPicker: Story = { play: clickButton("Epic and wave: Component catalog, First wave") };
export const StatusPicker: Story = { play: clickButton("Status: Todo") };
export const PriorityPicker: Story = { play: clickButton("Priority: None") };
export const LabelPicker: Story = { play: clickButton("Labels: None") };
export const MoreProperties: Story = { play: clickButton("More properties") };
export const DiscardConfirmation: Story = {
	play: async (context) => {
		await clickButton("More properties")(context);
		await clickButton("Discard draft…")(context);
	},
};
export const CreateAnother: Story = {
	parameters: { createMore: true },
	play: async (context) => {
		await clickButton("Create")(context);
		const body = within(context.canvasElement.ownerDocument.body);
		await waitFor(() => expect(body.getByLabelText("Title")).toHaveValue(""));
		await expect(body.getByRole("switch", { name: "Create another" })).toBeChecked();
	},
};
export const ParentLinked: Story = {
	parameters: {
		draft: { parent: "DEMO-2" },
		trellis: { responses: { "tickets.get": { ...ticket, identifier: "DEMO-2", title: "Review the catalog" } } },
	},
};
export const AssignmentError: Story = {
	parameters: {
		draft: { assignment: { preset: "claude", model: null, effort: null, accountId: null } },
		trellis: { responses: { "agentRuns.start": failure } },
	},
	play: clickButton("Create and assign"),
};
export const AssignmentPending: Story = {
	parameters: {
		draft: { assignment: { preset: "claude", model: null, effort: null, accountId: null } },
		trellis: { responses: { "agentRuns.start": pending } },
	},
	play: clickButton("Create and assign"),
};
const upload = async (context: { canvasElement: HTMLElement }) => {
	await within(context.canvasElement.ownerDocument.body).findByRole("button", { name: "Add attachment" });
	await userEvent.upload(
		context.canvasElement.ownerDocument.querySelector<HTMLInputElement>('input[type="file"].hidden')!,
		new File(["Catalog notes"], "catalog.txt", { type: "text/plain" }),
	);
	await clickButton("Create")(context);
};
export const UploadPending: Story = {
	parameters: { trellis: { responses: { "attachments.upload": pending } } },
	play: upload,
};
export const UploadError: Story = {
	parameters: { trellis: { responses: { "attachments.upload": failure } } },
	play: upload,
};

export const ProjectPicker: Story = { play: clickButton("Project: DEMO") };
export const AssignmentOff: Story = {
	parameters: {
		assignAgent: false,
		draft: { assignment: { preset: "claude", model: null, effort: null, accountId: null } },
	},
};
export const SavedToggles: Story = {
	...AssignmentOff,
	play: async (context) => {
		const body = within(context.canvasElement.ownerDocument.body);
		await userEvent.click(await body.findByRole("switch", { name: "Create another" }));
		await clickButton("Close and keep draft")(context);
		await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
		await clickButton("New ticket")(context);
		await expect(await body.findByRole("switch", { name: "Create another" })).toBeChecked();
		await expect(body.getByRole("switch", { name: "Assign agent" })).not.toBeChecked();
	},
};
export const UnselectedWave: Story = {
	parameters: {
		options: { project: "DEMO" },
		draft: { epic: null, wave: null },
		trellis: { responses: { "tickets.classify": pending } },
	},
};
export const AutomaticSelection: Story = {
	parameters: {
		options: { project: "DEMO" },
		draft: { epic: null, wave: null, priority: undefined },
	},
	play: async ({ canvasElement }) => {
		const body = within(canvasElement.ownerDocument.body);
		await waitFor(
			() => {
				expect(body.getByRole("button", { name: "Priority: High" })).toBeVisible();
				expect(body.getByRole("button", { name: "Epic and wave: Component catalog, First wave" })).toBeVisible();
				expect(body.getByRole("button", { name: "Create" })).toBeEnabled();
			},
			{ timeout: 3000 },
		);
	},
};
