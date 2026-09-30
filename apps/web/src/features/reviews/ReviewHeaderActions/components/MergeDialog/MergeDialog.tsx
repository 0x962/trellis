import { useQuery } from "@tanstack/react-query";
import { Button, Checkbox, Dialog, FieldHint } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";

export function MergeDialog({
	pr,
	processing,
	onMerge,
	onClose,
}: {
	pr: string;
	processing: boolean;
	onMerge: (input: { action: "merge" | "admin-merge"; completeTicketIds: string[] }) => void;
	onClose: () => void;
}) {
	const { orpc } = useApp();
	const tickets = useQuery(
		orpc.reviews.mergeTickets.queryOptions({ input: { pr }, staleTime: 0, enabled: !processing }),
	);
	const [admin, setAdmin] = useState(false);
	const [complete, setComplete] = useState(false);
	const canComplete = tickets.isSuccess && tickets.data.length > 0;
	const disabled = processing || tickets.isPending || tickets.isFetching;
	const merge = (markDone: boolean) => {
		setComplete(markDone);
		onMerge({
			action: admin ? "admin-merge" : "merge",
			completeTicketIds: markDone ? tickets.data!.map((ticket) => ticket.id) : [],
		});
	};
	return (
		<Dialog
			open
			title="Merge pull request?"
			description="This squashes the commits and merges the pull request."
			onOpenChange={(open) => !open && !processing && onClose()}
		>
			<Checkbox
				label="Admin merge"
				checked={admin}
				onCheckedChange={setAdmin}
				disabled={processing}
				className="text-sm"
			/>
			<FieldHint tone={tickets.isError ? "danger" : "default"} role="status">
				{tickets.isPending
					? "Checking linked tickets."
					: tickets.isError
						? "Cannot load linked tickets. Merge keeps ticket status unchanged."
						: canComplete
							? `Merge and mark done also completes ${tickets.data.map((ticket) => ticket.identifier).join(", ")}.`
							: "Merge keeps ticket status unchanged."}
			</FieldHint>
			<div className="flex flex-wrap justify-end gap-2">
				<Button disabled={processing} onClick={onClose}>
					Cancel
				</Button>
				{canComplete && (
					<Button variant="primary" disabled={disabled} processing={processing && complete} onClick={() => merge(true)}>
						Merge and mark done
					</Button>
				)}
				<Button
					variant={canComplete ? "default" : "primary"}
					disabled={disabled}
					processing={processing && !complete}
					onClick={() => merge(false)}
				>
					Merge
				</Button>
			</div>
		</Dialog>
	);
}
