import type { ComponentProps } from "react";
import { Dialog } from "../../primitives/Dialog";
import { ProviderFields } from "./components/ProviderFields";
import type { ProviderFieldsProps } from "./types";

export function ProviderForm({
	open,
	finalFocus,
	...props
}: ProviderFieldsProps & { open: boolean; finalFocus?: ComponentProps<typeof Dialog>["finalFocus"] }) {
	return (
		<Dialog
			open={open}
			finalFocus={finalFocus}
			onOpenChange={(next) => !next && !props.busy && props.onClose()}
			title={props.editing ? "Edit provider" : "Add provider"}
			description={
				props.editing
					? "Change the provider. Leave the key blank to keep the stored key."
					: "Give Trellis a key for a model gateway. Trellis stores the key on this machine and never shows it again."
			}
		>
			<ProviderFields {...props} />
		</Dialog>
	);
}
