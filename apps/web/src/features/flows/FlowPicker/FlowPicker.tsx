import { useQuery } from "@tanstack/react-query";
import type { FlowSummary } from "@trellis/api";
import { Command, FormStatus, PickerButton, Popover } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../lib/appContext";
import { createNameItem } from "../../pickers/utils/createNameItem";
import { NewFlowDialog } from "../FlowsPage/components/NewFlowDialog";

type Props = {
	flows: readonly FlowSummary[];
	ticket: string;
	value: string;
	disabled?: boolean;
	onPick: (id: string) => void;
};

export function FlowPicker({ flows, ticket, value, disabled, onPick }: Props) {
	const { orpc } = useApp();
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [createName, setCreateName] = useState<string | null>(null);
	const ticketQuery = useQuery({
		...orpc.tickets.get.queryOptions({ input: { ticket } }),
		enabled: createName !== null,
	});
	const createItem = createNameItem(
		"flow",
		search,
		flows.map((flow) => flow.name),
	);
	return (
		<>
			<Popover
				label="Flow"
				open={open}
				onOpenChange={(next) => {
					setOpen(next);
					if (!next) setSearch("");
				}}
				trigger={
					<PickerButton label="Flow" disabled={disabled}>
						{flows.find((flow) => flow.id === value)?.name ?? "Select a flow"}
					</PickerButton>
				}
			>
				<Command
					label="Search flows"
					placeholder="Search flows…"
					onSearchChange={setSearch}
					items={[...flows.map((flow) => ({ id: flow.id, label: flow.name })), ...(createItem ? [createItem] : [])]}
					onSelect={(id) => {
						if (id === createItem?.id) setCreateName(search.trim());
						else onPick(id);
						setOpen(false);
						setSearch("");
					}}
				/>
			</Popover>
			{createName !== null && ticketQuery.isPending && <p role="status">Load the ticket project…</p>}
			{createName !== null && ticketQuery.error && <FormStatus status="error" message={ticketQuery.error.message} />}
			{createName !== null && ticketQuery.data && (
				<NewFlowDialog
					key={ticket}
					scope={ticket}
					initialName={createName}
					initialProject={ticketQuery.data.project.key}
					projectLocked
					onClose={() => setCreateName(null)}
					onCreated={(flow) => {
						setCreateName(null);
						onPick(flow.id);
					}}
				/>
			)}
		</>
	);
}
