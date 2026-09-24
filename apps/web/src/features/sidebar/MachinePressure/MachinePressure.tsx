import { Link } from "@tanstack/react-router";
import { MachinePressure } from "@trellis/ui";
import { useCallback, useContext, useEffect, useId, useState } from "react";
import { MachinePressureContext } from "./MachinePressureProvider";

export function SidebarMachinePressure({ collapsed = false }: { collapsed?: boolean }) {
	const id = useId();
	const { machines, setDetailsOpen } = useContext(MachinePressureContext)!;
	const [open, setOpen] = useState(false);
	const changeOpen = useCallback(
		(next: boolean) => {
			setOpen(next);
			setDetailsOpen(id, next);
		},
		[id, setDetailsOpen],
	);
	useEffect(() => () => setDetailsOpen(id, false), [id, setDetailsOpen]);
	useEffect(() => {
		if (open && machines.every((machine) => machine.readings.length === 0)) changeOpen(false);
	}, [changeOpen, machines, open]);
	return (
		<MachinePressure
			machines={machines}
			collapsed={collapsed}
			open={open}
			onOpenChange={changeOpen}
			usageLink={
				<Link
					to="/usage"
					onClick={() => changeOpen(false)}
					className="font-medium text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
				>
					Open Usage for the full reading.
				</Link>
			}
		/>
	);
}
