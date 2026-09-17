import type { FlowDoc } from "@trellis/api";
import type { FlowExecution } from "../../agents/nativeFlow/types.ts";
import type { ServiceCtx as CoreCtx } from "../../context.ts";
import type { ServiceCtx } from "../support.ts";
export type FlowCtx = ServiceCtx & { core: CoreCtx; localUrl: string };
export interface StoredExecution {
	id: string;
	flow_id: string;
	ticket_id: string;
	project_id: string;
	doc: FlowDoc;
	state: FlowExecution;
	revision: number;
	request: unknown;
	created_at: string;
	updated_at: string;
}
