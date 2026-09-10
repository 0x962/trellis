import type { Status } from "@trellis/api";
import type { ReactElement } from "react";

export type StatusSheetProps = {
	open: boolean;
	statuses: readonly Status[];
	currentId: string;
	onChoose: (status: Status) => void;
	onClose: () => void;
};

// The bottom sheet under `testID="status-sheet"`: one header per category
// in the fixed order, one radio per status named by the status name.
export function StatusSheet(_props: StatusSheetProps): ReactElement | null {
	throw new Error("StatusSheet is not implemented");
}
