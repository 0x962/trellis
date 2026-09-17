import { X } from "@phosphor-icons/react";
import { IconButton } from "@trellis/ui";

export type ComposerHeaderProps = {
	closeDisabled?: boolean;
	onClose: () => void;
};

// The dialog title stays in the DOM for assistive technology. This visible
// heading gives sighted readers the same name and keeps the close action near it.
export function ComposerHeader({ closeDisabled = false, onClose }: ComposerHeaderProps) {
	return (
		<div data-composer-header="" className="flex min-h-7 items-center gap-2 px-1">
			<span aria-hidden="true" className="text-base font-semibold text-fg">
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
