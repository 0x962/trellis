import { type ReactNode, useRef } from "react";
import { Dialog } from "../../primitives/Dialog";
import "./waveStart.css";

export function WaveStartDialog({
	open,
	onOpenChange,
	wave,
	starting,
	children,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	wave: string;
	starting: boolean;
	children: ReactNode;
}) {
	const content = useRef<HTMLDivElement>(null);
	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!starting) onOpenChange(next);
			}}
			title={`Start ${wave}`}
			bare
			size="lg"
			initialFocus={() => content.current!.querySelector<HTMLElement>("[data-wave-title]")!}
			className="wave-start-dialog"
		>
			<div ref={content} className="contents">
				{children}
			</div>
		</Dialog>
	);
}
