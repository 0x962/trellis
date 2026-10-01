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
import type { ComponentProps } from "react";
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

type Args = ComponentProps<typeof WaveStartDialog> & {
	tickets: WaveStartTicket[];
	submitted: boolean;
};

const flatten = (tickets: readonly WaveStartTicket[]): WaveStartTicket[] =>
	tickets.flatMap((item) => [item, ...flatten(item.children)]);
const mapTickets = (
	tickets: readonly WaveStartTicket[],
	update: (ticket: WaveStartTicket) => WaveStartTicket,
): WaveStartTicket[] => tickets.map((item) => ({ ...update(item), children: mapTickets(item.children, update) }));

const meta = {
	title: "Components/WaveStartDialog",
	component: WaveStartDialog,
	args: {
		open: true,
		wave: "Wave 1",
		starting: false,
		onOpenChange: () => {},
		children: null,
		tickets: initialTickets,
		submitted: false,
	},
	parameters: {
		docs: {
			description: {
				component:
					"WaveStartContent renders the ticket tree inside WaveStartDialog. Select ready or waiting tickets. Start marks selected fixtures as started. Close and Cancel dismiss every state.",
			},
		},
	},
	render: function Render({ tickets: initial, submitted: wasSubmitted, ...args }) {
		const [open, setOpen] = useStoryState(args.open);
		const [tickets, setTickets] = useStoryState(initial);
		const [submitted, setSubmitted] = useStoryState(wasSubmitted);
		const all = flatten(tickets);
		const ready = all.filter((item) => !item.disabled && item.waitsOn.length === 0);
		const selectedCount = all.filter((item) => item.checked).length;
		return (
			<>
				<Tooltip content="Start wave">
					<IconButton label="Start wave" icon={<Play />} onClick={() => setOpen(true)} />
				</Tooltip>
				<WaveStartDialog {...args} open={open} onOpenChange={setOpen}>
					<WaveStartContent
						wave={args.wave}
						epic="Desktop release"
						tickets={tickets}
						total={all.length}
						selectedCount={selectedCount}
						readyCount={ready.length}
						readySelected={ready.filter((item) => item.checked).length}
						starting={args.starting}
						submitted={submitted}
						canSelect={all.some((item) => !item.disabled)}
						hasWaiting={all.some((item) => item.waitsOn.length > 0)}
						agent={<ProviderIcon provider="openai" />}
						startLabel={wasSubmitted ? "Retry failed ticket" : `Start ${selectedCount} tickets`}
						onClose={() => setOpen(false)}
						onStart={() => {
							setSubmitted(true);
							setTickets(
								mapTickets(tickets, (item) =>
									item.checked
										? {
												...item,
												checked: false,
												disabled: true,
												status: { category: "started", label: "Started" },
												note: "The local agent has started.",
												tone: "success",
											}
										: item,
								),
							);
						}}
						onToggle={(id, checked) =>
							setTickets(mapTickets(tickets, (item) => (item.id === id ? { ...item, checked } : item)))
						}
						onSelectReady={(checked) =>
							setTickets(
								mapTickets(tickets, (item) =>
									ready.some((entry) => entry.id === item.id) ? { ...item, checked } : item,
								),
							)
						}
					/>
				</WaveStartDialog>
			</>
		);
	},
} satisfies Meta<Args>;
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
	args: { tickets: [ticket("TRL-42", { disabled: true, checked: false, note: "An agent already owns this ticket." })] },
};
export const Empty: Story = { args: { tickets: [] } };
export const Failed: Story = {
	args: { tickets: [ticket("TRL-42", { note: "The agent does not start.", tone: "danger" })], submitted: true },
};
export const PartialSelection: Story = {
	args: { tickets: [ticket("TRL-42"), ticket("TRL-43", { checked: false })] },
};
export const NestedTickets: Story = {
	args: {
		tickets: [
			ticket("TRL-42", {
				children: [
					ticket("TRL-43", { checked: false, waitsOn: ["TRL-42"], note: "Waits for TRL-42", tone: "warning" }),
				],
			}),
		],
	},
};
export const RetryFailedTicket: Story = {
	args: { ...Failed.args },
	play: async ({ canvasElement }) => {
		const body = within(canvasElement.ownerDocument.body);
		await userEvent.click(await body.findByRole("button", { name: "Retry failed ticket" }));
		await expect(body.queryByRole("alert")).not.toBeInTheDocument();
		await expect(body.getByText("The local agent has started.")).toBeVisible();
		await expect(body.getByRole("checkbox", { name: "Start TRL-42: Restore the project view" })).toHaveAttribute(
			"aria-disabled",
			"true",
		);
		await userEvent.click(body.getAllByRole("button", { name: "Close" })[0]!);
		await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
	},
};
export const CloseEmpty: Story = {
	args: { tickets: [] },
	play: async ({ canvasElement }) => {
		const body = within(canvasElement.ownerDocument.body);
		await userEvent.click((await body.findAllByRole("button", { name: "Close" }))[0]!);
		await waitFor(() => expect(body.queryByRole("dialog")).not.toBeInTheDocument());
	},
};
