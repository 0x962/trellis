import { ORPCError } from "@orpc/client";
import type { Flow } from "@trellis/api";
import { useEffect, useMemo, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import type { DraftGraph } from "../../flowDraft";

export type AutosaveStatus = "saved" | "pending" | "saving" | "invalid" | "conflict" | "error";

// The wait after the last change before a save starts. A drag changes the
// graph on every frame, so the save starts after the drag ends.
const SAVE_DELAY_MS = 600;

type AutosaveOptions = { flow: Flow; graph: DraftGraph; valid: boolean; onSaved: (flow: Flow) => void };

// Saves the graph a moment after it changes. One save runs at a time, and each
// save sends the version the last save returned. A graph with an issue waits
// until the person fixes it. After a conflict or an error, no save starts
// until the person reloads or calls `retry`.
export function useFlowAutosave({ flow, graph, valid, onSaved }: AutosaveOptions) {
	const { client } = useApp();
	const json = useMemo(() => JSON.stringify(graph), [graph]);
	const [savedJson, setSavedJson] = useState(json);
	const [saving, setSaving] = useState(false);
	const [failure, setFailure] = useState<"conflict" | "error" | null>(null);

	useEffect(() => {
		if (json === savedJson || !valid || saving || failure !== null) return;
		const timer = setTimeout(() => {
			setSaving(true);
			client.flows.save({ flow: flow.id, ...graph, expectedVersion: flow.version }).then(
				(doc) => {
					setSaving(false);
					setSavedJson(json);
					onSaved(doc.flow);
				},
				(error: unknown) => {
					setSaving(false);
					setFailure(error instanceof ORPCError && error.code === "FLOW_VERSION_CONFLICT" ? "conflict" : "error");
				},
			);
		}, SAVE_DELAY_MS);
		return () => clearTimeout(timer);
	}, [json, savedJson, valid, saving, failure, client, flow.id, flow.version, graph, onSaved]);

	const status: AutosaveStatus =
		failure ?? (saving ? "saving" : json === savedJson ? "saved" : valid ? "pending" : "invalid");
	return { status, retry: () => setFailure(null) };
}
