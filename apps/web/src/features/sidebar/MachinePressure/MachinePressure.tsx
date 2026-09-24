import { Link } from "@tanstack/react-router";
import { MachinePressure } from "@trellis/ui";
import { useMachinePressure } from "./useMachinePressure";

export function SidebarMachinePressure({ collapsed = false }: { collapsed?: boolean }) {
	const { machines, open, setOpen } = useMachinePressure();
	return (
		<MachinePressure
			machines={machines}
			collapsed={collapsed}
			open={open}
			onOpenChange={setOpen}
			usageLink={
				<Link
					to="/usage"
					onClick={() => setOpen(false)}
					className="font-medium text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
				>
					Open Usage for the full reading.
				</Link>
			}
		/>
	);
}
