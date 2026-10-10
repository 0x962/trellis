import { useQuery } from "@tanstack/react-query";
import { LabelNameSchema, WaveNameSchema } from "@trellis/api";
import { toast } from "@trellis/ui";
import { useEffect, useState } from "react";
import { useApp } from "../../../../../../../lib/appContext";
import { CreateRelatedTicketDialog } from "../../../../../../composer/CreateRelatedTicketDialog";
import { usePickerCreate } from "../../../../../../pickers/hooks/usePickerCreate";
import { createNameItem } from "../../../../../../pickers/utils/createNameItem";
import { StatusCreateDialog } from "../../../../../../project-settings/StatusCreateDialog";
import type { FilterField } from "../../../../../fields";
import type { View } from "../../../../../grammar";
import { CreateWaveDialog } from "../../components/CreateWaveDialog";

export function useFilterCreate({
	field,
	open,
	search,
	project,
	view,
	onChange,
	close,
	ticketNames,
	ticketReady,
}: {
	field: FilterField | undefined;
	open: boolean;
	search: string;
	project: string | undefined;
	view: View;
	onChange: (view: View) => void;
	close: () => void;
	ticketNames: string[];
	ticketReady: boolean;
}) {
	const { client, orpc, queryClient } = useApp();
	const statuses = useQuery({
		...orpc.statuses.list.queryOptions({ input: { project: project ?? "" } }),
		enabled: project !== undefined && field === "status",
		retry: false,
	});
	const labels = useQuery({
		...orpc.labels.list.queryOptions({ input: { project: project ?? "" } }),
		enabled: project !== undefined && field === "label",
		retry: false,
	});
	const [dialog, setDialog] = useState<{ kind: "status" | "wave"; name: string } | null>(null);
	const [ticketTitle, setTicketTitle] = useState<string | null>(null);
	const [ticketOpen, setTicketOpen] = useState(false);
	const labelCreate = usePickerCreate({
		scope: JSON.stringify({ project, view, field, open }),
		create: (name) => client.labels.create({ project: project!, name }),
		invalidate: () => queryClient.invalidateQueries({ queryKey: orpc.labels.key() }),
		onCreated: (label) => {
			onChange({ ...view, label: [...(view.label ?? []), label.name.toLowerCase()] });
			close();
		},
	});
	useEffect(() => {
		if (labelCreate.error) toast.error("Label could not be created", { description: labelCreate.error });
	}, [labelCreate.error]);
	const item =
		field === "waitsOn"
			? ticketReady
				? createNameItem("ticket", search, ticketNames)
				: null
			: project === undefined
				? null
				: field === "label" && labels.isSuccess
					? createNameItem(
							"label",
							search,
							labels.data.labels.map((label) => label.name),
							(name) => LabelNameSchema.safeParse(name).success,
						)
					: field === "status" && statuses.isSuccess
						? createNameItem(
								"status",
								search,
								statuses.data.statuses.map((status) => status.name),
							)
						: field === "wave"
							? createNameItem("wave", search, [], (name) => WaveNameSchema.safeParse(name).success)
							: null;
	return {
		item,
		pick: () => {
			if (field === "waitsOn") {
				setTicketTitle(search.trim());
				setTicketOpen(true);
				close();
			} else if (field === "label") labelCreate.create(search.trim());
			else if (field === "status" || field === "wave") {
				setDialog({ kind: field, name: search.trim() });
				close();
			}
		},
		dialog: (
			<>
				{dialog === null ? null : dialog.kind === "status" ? (
					<StatusCreateDialog
						project={project!}
						initialName={dialog.name}
						onClose={() => setDialog(null)}
						onCreated={(status) => {
							onChange({ ...view, status: [...(view.status ?? []), status.slug] });
							setDialog(null);
						}}
					/>
				) : (
					<CreateWaveDialog
						project={project!}
						initialName={dialog.name}
						onClose={() => setDialog(null)}
						onCreated={(wave) => {
							onChange({ ...view, wave: wave.ref });
							setDialog(null);
						}}
					/>
				)}
				{ticketTitle !== null && (
					<CreateRelatedTicketDialog
						scope={`filter:waitsOn:${project ?? "*"}`}
						project={project}
						initialTitle={ticketTitle}
						open={ticketOpen}
						onClose={(completed) => {
							setTicketOpen(false);
							if (completed) setTicketTitle(null);
						}}
						onCreated={(ticket) => {
							onChange({ ...view, waitsOn: ticket.identifier });
							setTicketOpen(false);
							setTicketTitle(null);
						}}
					/>
				)}
			</>
		),
	};
}
