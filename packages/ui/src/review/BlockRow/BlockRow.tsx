import type { ReactNode } from "react";
import { PropertyRow } from "../../primitives/PropertyRow";

export type BlockRowProps = {
	label: string;
	children: ReactNode;
};

// One row of a ticket block, such as `Verify` in the contract or `Waits on`
// in the chain: a label on the left, and a column of lines on the right. The
// `dd` of `PropertyRow` lays its children in a row, so the column lives in
// the div here.
export function BlockRow({ label, children }: BlockRowProps) {
	return (
		<PropertyRow label={label} align="start" labelWidth="wide">
			<div className="flex min-w-0 flex-1 flex-col">{children}</div>
		</PropertyRow>
	);
}
