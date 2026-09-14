import type { ServiceCtx as CoreCtx } from "../../context.ts";
import type { ServiceCtx } from "../support.ts";

export type EvidenceCtx = ServiceCtx & { core: CoreCtx };
