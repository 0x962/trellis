import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Note } from "@trellis/api";
import { NoteSheet } from "../../features/notes/NotesSettings/components/NoteSheet";
import { OverlayTrigger } from "./components/OverlayTrigger";
import { actor, at, failure, id, noop, pending, project, responses } from "./fixtures";
import { clickButton, fillField } from "./interactions";

const note: Note = {
	id: id(81),
	projectId: project.id,
	projectKey: project.key,
	title: "Catalog rules",
	body: "Use synthetic data for all stories.",
	audience: "all",
	expiresAt: null,
	actor,
	createdAt: at,
	updatedAt: at,
};
const meta = {
	title: "Overlays/NoteSheet",
	component: NoteSheet,
	args: { project, onClose: noop },
	parameters: {
		trellis: {
			responses: { ...responses, "notes.create": note, "notes.update": note, "notes.delete": { id: note.id } },
		},
	},
	render: (args, context) => (
		<OverlayTrigger label="New note" initiallyOpen={!context.parameters.closed}>
			{(close) => <NoteSheet {...args} onClose={close} />}
		</OverlayTrigger>
	),
} satisfies Meta<typeof NoteSheet>;
export default meta;
type Story = StoryObj<typeof meta>;
const submit = async (context: { canvasElement: HTMLElement }) => {
	await fillField(context.canvasElement, "Title", "Catalog rules");
	await fillField(context.canvasElement, "Body", "Use synthetic data for all stories.");
	await clickButton("Create note")(context);
};
export const Open: Story = {};
export const ClosedTrigger: Story = { parameters: { closed: true } };
export const Selected: Story = { args: { note } };
export const Disabled: Story = { args: { note, readOnly: true } };
export const Pending: Story = { parameters: { trellis: { responses: { "notes.create": pending } } }, play: submit };
export const RequestError: Story = {
	parameters: { trellis: { responses: { "notes.create": failure } } },
	play: submit,
};
export const Success: Story = { play: submit };
export const DeleteConfirmation: Story = { args: { note }, play: clickButton("Delete note") };
