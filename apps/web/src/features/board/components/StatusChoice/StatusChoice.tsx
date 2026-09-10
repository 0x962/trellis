import type { Status } from "@trellis/api";
import { Button, StatusIcon } from "@trellis/ui";

export type StatusChoiceProps = {
	statuses: Status[];
	onChoose: (status: Status) => void;
	onCancel: () => void;
};

export function StatusChoice({ statuses, onChoose, onCancel }: StatusChoiceProps) {
	return (
		<div
			role="dialog"
			aria-label="Choose a status"
			className="fixed top-12 left-1/2 z-50 flex w-60 -translate-x-1/2 flex-col gap-1 rounded-lg border border-border bg-elevated p-2 shadow-md"
		>
			<p className="px-2 py-1 text-sm font-medium text-fg">Choose a status</p>
			{statuses.map((status) => (
				<Button
					key={status.id}
					variant="quiet"
					className="w-full justify-start"
					icon={<StatusIcon category={status.category} reviewer={status.reviewer ?? undefined} />}
					onClick={() => onChoose(status)}
				>
					{status.name}
				</Button>
			))}
			<Button variant="quiet" size="sm" onClick={onCancel}>
				Cancel
			</Button>
		</div>
	);
}
