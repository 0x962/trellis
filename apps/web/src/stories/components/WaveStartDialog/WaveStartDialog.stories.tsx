import { Play } from "@phosphor-icons/react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
	IconButton,
	ProviderIcon,
	Tooltip,
	WaveStartContent,
	WaveStartDialog,
	type WaveStartTicket,
} from "@trellis/ui";
import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { useStoryState } from "../useStoryState";

const ticket = (id: string, fields: Partial<WaveStartTicket> = {}): WaveStartTicket => ({
	id,
	identifier: id,
	title: "Restore the project view",
	status: { category: "todo", label: "Todo" },
	checked: true,
	disabled: false,
	waitsOn: [],
	note: null,
	tone: "muted",
	children: [],
	...fields,
});
const initialTickets = [
	ticket("TRL-42"),
	ticket("TRL-43", {
		checked: false,
		title: "Review the ticket selection",
		waitsOn: ["TRL-42"],
		note: "Waits for TRL-42",
		tone: "warning",
	}),
	ticket("TRL-44", {
		checked: false,
		disabled: true,
		title: "Build the app",
		status: { category: "started", label: "Started" },
		note: "An agent already owns this ticket.",
	}),
];

const meta = {
	title: "Components/WaveStartDialog",
	component: WaveStartDialog,
	args: { open: true, wave: "Wave 1", starting: false, onOpenChange: () => {}, children: null },
	parameters: {
		docs: {
			description: {
				component:
					"WaveStartContent renders the dependency list inside WaveStartDialog. Select ready or waiting tickets. Start records a local result and preserves the selection.",
			},
		},
	},
	render: function Render(args) {
		const [open, setOpen] = useStoryState(args.open);
		const [tickets, setTickets] = useState(initialTickets);
		const [submitted, setSubmitted] = useState(false);
		const ready = tickets.filter((item) => !item.disabled && item.waitsOn.length === 0);
		const selectedCount = tickets.filter((item) => item.checked).length;
		return (
			<>
				<Tooltip content="Start wave">
					<IconButton label="Start wave" icon={<Play />} onClick={() => setOpen(true)} />
				</Tooltip>
				<WaveStartDialog {...args} open={open} onOpenChange={setOpen}>
					{args.children ?? (
						<WaveStartContent
							wave={args.wave}
							epic="Desktop release"
							tickets={tickets}
							total={tickets.length}
							selectedCount={selectedCount}
							readyCount={ready.length}
							readySelected={ready.filter((item) => item.checked).length}
							starting={args.starting}
							submitted={submitted}
							canSelect
							hasWaiting
							agent={<ProviderIcon provider="openai" />}
							startLabel={submitted ? "Start again" : `Start ${selectedCount} tickets`}
							onClose={() => setOpen(false)}
							onStart={() => setSubmitted(true)}
							onToggle={(id, checked) =>
								setTickets(tickets.map((item) => (item.id === id ? { ...item, checked } : item)))
							}
							onSelectReady={(checked) =>
								setTickets(
									tickets.map((item) => (ready.some((entry) => entry.id === item.id) ? { ...item, checked } : item)),
								)
							}
						/>
					)}
				</WaveStartDialog>
			</>
		);
	},
} satisfies Meta<typeof WaveStartDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Closed: Story = { args: { open: false } };
export const Starting: Story = { args: { starting: true } };
export const NoneSelected: Story = {
	play: async ({ canvasElement }) => {
		const body = within(canvasElement.ownerDocument.body);
		await userEvent.click(await body.findByRole("checkbox", { name: "Select all ready tickets" }));
		await waitFor(() => expect(body.getByRole("button", { name: "Start 0 tickets" })).toBeDisabled());
	},
};
export const NoSelectableTickets: Story = {
	args: {
		children: (
			<WaveStartContent
				wave="Wave 1"
				tickets={[ticket("TRL-42", { disabled: true, checked: false, note: "An agent already owns this ticket." })]}
				total={1}
				selectedCount={0}
				readyCount={0}
				readySelected={0}
				starting={false}
				submitted={false}
				canSelect={false}
				hasWaiting={false}
				agent={null}
				startLabel="Start"
				onClose={() => {}}
				onStart={() => {}}
				onToggle={() => {}}
				onSelectReady={() => {}}
			/>
		),
	},
};
export const Empty: Story = {
	args: {
		children: (
			<WaveStartContent
				wave="Wave 1"
				tickets={[]}
				total={0}
				selectedCount={0}
				readyCount={0}
				readySelected={0}
				starting={false}
				submitted={false}
				canSelect={false}
				hasWaiting={false}
				agent={null}
				startLabel="Start"
				onClose={() => {}}
				onStart={() => {}}
				onToggle={() => {}}
				onSelectReady={() => {}}
			/>
		),
	},
};
export const Failed: Story = {
	args: {
		children: (
			<WaveStartContent
				wave="Wave 1"
				tickets={[ticket("TRL-42", { note: "The agent does not start.", tone: "danger" })]}
				total={1}
				selectedCount={1}
				readyCount={1}
				readySelected={1}
				starting={false}
				submitted
				canSelect
				hasWaiting={false}
				agent={<ProviderIcon provider="openai" />}
				startLabel="Retry failed ticket"
				onClose={() => {}}
				onStart={() => {}}
				onToggle={() => {}}
				onSelectReady={() => {}}
			/>
		),
	},
};
