import { X } from "@phosphor-icons/react";
import { IconButton } from "@trellis/ui";

export type ComposerHeaderProps = {
	closeDisabled?: boolean;
	onClose: () => void;
};

// The dialog title stays in the DOM for assistive technology. This visible
// label gives sighted readers the same name and keeps the close action near
// it. This label uses a smaller size and a muted colour, because a person
// reads the ticket title under it first.
export function ComposerHeader({ closeDisabled = false, onClose }: ComposerHeaderProps) {
	return (
		<div className="flex min-h-7 items-center gap-2">
			<span aria-hidden="true" className="text-sm font-medium text-fg-muted">
				New ticket
			</span>
			<IconButton
				variant="quiet"
				size="sm"
				label="Close"
				icon={<X />}
				disabled={closeDisabled}
				onClick={onClose}
				className="ml-auto"
			/>
		</div>
	);
}
