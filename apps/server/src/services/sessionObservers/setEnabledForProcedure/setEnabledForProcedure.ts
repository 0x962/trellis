import type { SessionObserver, SessionObserverSetEnabledInput } from "@trellis/api";
import type { ServiceCtx } from "../../../context.ts";
import type { Tx } from "../../../db/tx.ts";
import { setEnabled } from "../setEnabled";

export const setEnabledForProcedure = async (
	ctx: ServiceCtx,
	tx: Tx,
	input: SessionObserverSetEnabledInput,
): Promise<SessionObserver> => (await setEnabled(ctx, tx, input)).observer;
