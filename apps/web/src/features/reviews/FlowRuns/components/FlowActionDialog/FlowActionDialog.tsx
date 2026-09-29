import { X } from "@phosphor-icons/react";
import { Dialog, IconButton, Tooltip } from "@trellis/ui";
import type { ReactNode } from "react";

export function FlowActionDialog({
	title,
	children,
	actions,
	onClose,
}: {
	title: string;
	children: ReactNode;
	actions?: ReactNode;
	onClose: () => void;
}) {
	return (
		<Dialog
			open
			bare
			title={title}
			size="lg"
			className="overflow-hidden max-md:overflow-hidden"
			onOpenChange={(open) => !open && onClose()}
		>
			<header className="flex shrink-0 items-center justify-between gap-3 border-b border-border p-4">
				<h2 className="min-w-0 text-md font-semibold">{title}</h2>
				<Tooltip content="Close dialog">
					<IconButton label="Close dialog" icon={<X />} onClick={onClose} />
				</Tooltip>
			</header>
			<div className="flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain p-4">{children}</div>
			{actions && (
				<footer
					style={{ paddingBottom: "max(calc(var(--spacing) * 4), env(safe-area-inset-bottom))" }}
					className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border p-4"
				>
					{actions}
				</footer>
			)}
		</Dialog>
	);
}
