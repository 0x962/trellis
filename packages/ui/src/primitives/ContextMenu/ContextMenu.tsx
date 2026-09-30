import { ContextMenu as BaseContextMenu } from "@base-ui/react/context-menu";
import type { ReactNode } from "react";
import type { MenuGroup, MenuItem } from "../Menu";
import { MenuPopup } from "../MenuPopup";

export type ContextMenuProps = Pick<
	BaseContextMenu.Root.Props,
	"open" | "onOpenChange" | "onOpenChangeComplete" | "disabled"
> & {
	children: ReactNode;
	label: string;
	items: readonly MenuItem[] | readonly MenuGroup[];
	finalFocus?: BaseContextMenu.Popup.Props["finalFocus"];
	onClose: () => void;
};

export function ContextMenu({ children, label, items, finalFocus, onClose, ...props }: ContextMenuProps) {
	return (
		<BaseContextMenu.Root {...props}>
			{children}
			<BaseContextMenu.Portal>
				<BaseContextMenu.Positioner className="z-50 outline-none">
					<MenuPopup
						aria-label={label}
						items={items}
						finalFocus={finalFocus}
						onClose={onClose}
						onKeyDown={(event) => event.stopPropagation()}
					/>
				</BaseContextMenu.Positioner>
			</BaseContextMenu.Portal>
		</BaseContextMenu.Root>
	);
}
