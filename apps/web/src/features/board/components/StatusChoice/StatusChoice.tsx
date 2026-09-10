import type { Status } from "@trellis/api";
import { Button, Popover, StatusIcon } from "@trellis/ui";

export type StatusChoiceProps = {
	statuses: Status[];
	onChoose: (status: Status) => void;
	onCancel: () => void;
};

export function StatusChoice({ statuses, onChoose, onCancel }: StatusChoiceProps) {
	return (
		<Popover
			open
			onOpenChange={(open) => {
				if (!open) onCancel();
			}}
			align="center"
			className="flex w-60 flex-col gap-1"
			trigger={
				<Button aria-label="Status options" className="fixed top-12 left-1/2 size-px -translate-x-1/2 opacity-0">
					Status options
				</Button>
			}
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
		</Popover>
	);
}
