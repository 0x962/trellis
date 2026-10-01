import { Plus } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { IconButton, Tooltip } from "@trellis/ui";
import { userEvent, within } from "storybook/test";
import { ComposerHost } from "../../features/composer/ComposerHost";
import { composerActions } from "../../features/composer/composerStore";
import { draftKey } from "../../features/composer/hooks/useComposerDraft/useComposerDraft";
import { epic, failure, pending, responses, run, ticket, wave } from "./fixtures";
import { clickButton } from "./interactions";

const draft = {
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
				"tickets.classify": { priority: "high", epic: epic.ref, wave: wave.ref },
			},
		},
	},
	beforeEach: (context) => {
		sessionStorage.setItem(
			draftKey,
			JSON.stringify(
				context.parameters.empty ? { ...draft, title: "", description: "" } : { ...draft, ...context.parameters.draft },
			),
		);
		if (context.parameters.closed) composerActions.close();
		else composerActions.open({ project: "DEMO", epic: epic.ref, wave: wave.ref });
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
export const Empty: Story = { parameters: { empty: true } };
export const Loading: Story = { parameters: { trellis: { responses: { "epics.list": pending } } } };
export const PlacementError: Story = { parameters: { trellis: { responses: { "epics.list": failure } } } };
export const Pending: Story = {
	parameters: { trellis: { responses: { "tickets.create": pending } } },
	play: clickButton("Create ticket"),
};
export const RequestError: Story = {
	parameters: { trellis: { responses: { "tickets.create": failure } } },
	play: clickButton("Create ticket"),
};
export const Success: Story = { play: clickButton("Create ticket") };
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
export const CreateAnother: Story = { parameters: { draft: { createMore: true } }, play: clickButton("Create ticket") };
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
	await clickButton("Create ticket")(context);
};
export const UploadPending: Story = {
	parameters: { trellis: { responses: { "attachments.upload": pending } } },
	play: upload,
};
export const UploadError: Story = {
	parameters: { trellis: { responses: { "attachments.upload": failure } } },
	play: upload,
};
