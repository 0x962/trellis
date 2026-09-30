import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { type ComponentProps, useRef } from "react";
import { Dialog } from "../../../ui";

export function DialogFrame({ embedded, ...props }: ComponentProps<typeof Dialog> & { embedded: boolean }) {
	const portal = useRef<HTMLDivElement>(null);
	if (!embedded) return <Dialog {...props} />;
	return (
		<>
			<div ref={portal} />
			<BaseDialog.Root
				open={props.open}
				modal={false}
				onOpenChange={(open, details) => {
					if (details.reason === "escape-key") props.onOpenChange(open);
				}}
			>
				<BaseDialog.Portal container={portal}>
					{props.open && <div className="preview-scrim" aria-hidden="true" />}
					<BaseDialog.Popup
						initialFocus={props.initialFocus}
						finalFocus={props.finalFocus}
						className={`embedded-composer ${props.className}`}
					>
						<BaseDialog.Title className="sr-only">{props.title}</BaseDialog.Title>
						{props.children}
					</BaseDialog.Popup>
				</BaseDialog.Portal>
			</BaseDialog.Root>
		</>
	);
}
