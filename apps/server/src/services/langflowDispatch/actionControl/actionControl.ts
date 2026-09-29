import { ORPCError } from "@orpc/server";
import { DispatchReceiptArchive, LangflowHostControl } from "../../../langflowHost";

export function actionControl(home: string) {
	if (LangflowHostControl.recovery(home).state === "unavailable")
		throw new ORPCError("FLOW_RUNTIME_UNAVAILABLE", { status: 503, defined: true });
	const control = LangflowHostControl.openEffects({
		home,
		readTerminal: (permit, receiptId) => archive.readTerminal(permit, receiptId),
	});
	const archive = DispatchReceiptArchive.open(control);
	return { ...control, archive };
}
