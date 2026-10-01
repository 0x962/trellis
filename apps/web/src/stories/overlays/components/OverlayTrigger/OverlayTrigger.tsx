import { Plus } from "@phosphor-icons/react";
import { IconButton, Tooltip } from "@trellis/ui";
import { type ReactNode, useState } from "react";

export function OverlayTrigger({
	children,
	initiallyOpen = true,
	label,
}: {
	children: (close: () => void) => ReactNode;
	initiallyOpen?: boolean;
	label: string;
}) {
	const [open, setOpen] = useState(initiallyOpen);
	return (
		<>
			<Tooltip content={label}>
				<IconButton label={label} icon={<Plus />} onClick={() => setOpen(true)} />
			</Tooltip>
			{open && children(() => setOpen(false))}
		</>
	);
}
