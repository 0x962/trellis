import { Popover } from "@base-ui/react/popover";
import { X } from "@phosphor-icons/react";
import { IconButton } from "../../../../primitives/IconButton";
import { Tooltip } from "../../../../primitives/Tooltip";
import { cx } from "../../../../utils/cx";
import type { MachinePressureProps } from "../../MachinePressure";
import { MachineInspector } from "./components/MachineInspector";

export function MachinePanel({ machines, usageLink }: Pick<MachinePressureProps, "machines" | "usageLink">) {
	return (
		<div className="w-112 max-w-full">
			<header className="flex items-center justify-between gap-3 px-5 pt-4 pb-1 max-sm:px-3">
				<h2 className="text-lg font-semibold">Machine</h2>
				<Tooltip content="Close machine">
					<Popover.Close render={<IconButton label="Close machine" icon={<X />} />} />
				</Tooltip>
			</header>
			{machines.map((machine, index) => (
				<div key={machine.id} className={cx(index > 0 && "border-t border-border pt-4")}>
					<MachineInspector machine={machine} usageLink={index === machines.length - 1 ? usageLink : undefined} />
				</div>
			))}
		</div>
	);
}
