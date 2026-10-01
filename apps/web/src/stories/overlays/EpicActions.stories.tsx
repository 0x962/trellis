import type { Meta, StoryObj } from "@storybook/react-vite";
import { userEvent, within } from "storybook/test";
import { EpicTopbarActions } from "../../features/epics/EpicPage/components/EpicTopbarActions";
import { EpicChatter } from "../../features/epics/EpicPage/components/EpicTopbarActions/components/EpicChatter";
import { EpicSwitcher } from "../../features/epics/EpicSwitcher";
import { EpicRow } from "../../features/epics/EpicsPage/components/EpicRow";
import type { WaveEditing } from "../../features/table/hooks/useWaveEditing";
import { WaveActions } from "../../features/table/WaveHeader/components/WaveActions";
import { at, epic, failure, id, noop, pending, responses, wave } from "./fixtures";
import { clickButton } from "./interactions";

const waveEditing: WaveEditing = {
	epicRef: epic.ref,
	waves: [wave],
	busy: false,
	renamingId: null,
	create: noop,
	startRename: noop,
	rename: async () => {},
	endRename: noop,
	move: noop,
	canMove: () => true,
	requestDelete: noop,
	element: null,
};
const meta = {
	title: "Overlays/EpicActions",
	component: EpicTopbarActions,
	args: {
		project: "DEMO",
		epic: { ...epic, identifiers: [] },
		readOnly: false,
		waveEditing,
		shareItems: [
			{ label: "Copy link", onSelect: noop },
			{ label: "Copy as CLI", onSelect: noop },
		],
		onAddTicket: noop,
		onEdit: noop,
		onDelete: noop,
	},
	parameters: {
		trellis: {
			responses: {
				...responses,
				"epicChatter.get": { enabled: true },
				"epicChatter.list": { items: [], nextCursor: null },
				"epicChatter.set": { enabled: false },
			},
		},
	},
} satisfies Meta<typeof EpicTopbarActions>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ClosedTrigger: Story = {};
export const Open: Story = { play: clickButton("Actions for Component catalog") };
export const Disabled: Story = { args: { epic: null } };
export const ReadOnly: Story = { args: { readOnly: true }, play: clickButton("Actions for Component catalog") };
export const AddMenu: Story = { play: clickButton("Add") };
export const AddPending: Story = { args: { waveEditing: { ...waveEditing, busy: true } }, play: clickButton("Add") };
export const AddTickets: Story = {
	play: async (context) => {
		await clickButton("Add")(context);
		await userEvent.click(
			await within(context.canvasElement.ownerDocument.body).findByRole("menuitem", { name: "Ticket" }),
		);
	},
};
export const SwitcherClosed: Story = {
	render: () => <EpicSwitcher project="DEMO" epicRef={epic.ref} name={epic.name} tab="overview" />,
};
export const SwitcherOpen: Story = { ...SwitcherClosed, play: clickButton(epic.name) };
export const SwitcherLoading: Story = {
	...SwitcherOpen,
	parameters: { trellis: { responses: { "epics.list": pending } } },
};
export const SwitcherEmpty: Story = { ...SwitcherOpen, parameters: { trellis: { responses: { "epics.list": [] } } } };
export const WaveClosed: Story = {
	render: () => (
		<WaveActions
			name={wave.name}
			project="DEMO"
			exclude={[]}
			first={false}
			last={false}
			onAddTicket={noop}
			onNewTicket={noop}
			onRename={noop}
			onMove={noop}
			onDelete={noop}
		/>
	),
};
export const WaveOpen: Story = { ...WaveClosed, play: clickButton("Actions for First wave") };
export const WaveDisabled: Story = {
	render: () => (
		<WaveActions
			name={wave.name}
			project="DEMO"
			exclude={[]}
			first
			last
			onAddTicket={noop}
			onNewTicket={noop}
			onRename={noop}
			onMove={noop}
			onDelete={noop}
		/>
	),
	play: clickButton("Actions for First wave"),
};
export const WaveAddTickets: Story = { ...WaveClosed, play: clickButton("Add tickets to First wave") };
export const ChatterEmpty: Story = { play: clickButton("Chatter") };
export const ChatterLoading: Story = {
	parameters: { trellis: { responses: { "epicChatter.list": pending, "epicChatter.get": pending } } },
	play: clickButton("Chatter"),
};
export const ChatterError: Story = {
	parameters: { trellis: { responses: { "epicChatter.list": failure } } },
	play: clickButton("Chatter"),
};
export const ChatterReadOnly: Story = {
	render: () => <EpicChatter epic={epic} readOnly />,
	play: clickButton("Chatter"),
};
export const RowClosed: Story = {
	render: () => (
		<ul>
			<EpicRow epic={epic} readOnly={false} onEdit={noop} onDelete={noop} />
		</ul>
	),
};
export const RowOpen: Story = { ...RowClosed, play: clickButton("Actions for Component catalog") };
export const RowDisabled: Story = {
	render: () => (
		<ul>
			<EpicRow epic={epic} readOnly onEdit={noop} onDelete={noop} />
		</ul>
	),
	play: clickButton("Actions for Component catalog"),
};
export const ChatterPopulated: Story = {
	parameters: {
		trellis: {
			responses: {
				"epicChatter.list": {
					items: ["pending", "sent", "queued", "skipped", "unconfirmed"].map((state, index) => ({
						id: id(200 + index),
						senderId: id(60),
						senderName: "Catalog agent",
						recipientId: id(61),
						recipientName: "Review agent",
						text: "Review the dialog states.",
						state,
						createdAt: at,
					})),
					nextCursor: null,
				},
			},
		},
	},
	play: clickButton("Chatter"),
};
export const ChatterPending: Story = {
	parameters: { trellis: { responses: { "epicChatter.set": pending } } },
	play: async (context) => {
		await clickButton("Chatter")(context);
		await userEvent.click(
			await within(context.canvasElement.ownerDocument.body).findByRole("switch", { name: "Chatter" }),
		);
	},
};
