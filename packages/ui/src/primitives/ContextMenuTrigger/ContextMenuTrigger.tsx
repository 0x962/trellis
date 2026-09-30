import { ContextMenu as BaseContextMenu } from "@base-ui/react/context-menu";

export function ContextMenuTrigger({ onKeyDown, ...props }: BaseContextMenu.Trigger.Props) {
	return (
		<BaseContextMenu.Trigger
			{...props}
			onKeyDown={(event) => {
				onKeyDown?.(event);
				if (event.defaultPrevented) return;
				if (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey)) return;
				event.preventDefault();
				event.stopPropagation();
				const target = event.target as HTMLElement;
				const rect = target.getBoundingClientRect();
				// The native event uses Base UI's pointer anchor and open lifecycle.
				target.dispatchEvent(
					new MouseEvent("contextmenu", {
						bubbles: true,
						cancelable: true,
						button: 2,
						clientX: rect.left,
						clientY: rect.bottom,
					}),
				);
			}}
		/>
	);
}
