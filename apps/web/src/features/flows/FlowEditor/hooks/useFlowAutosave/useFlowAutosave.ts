import { ORPCError } from "@orpc/client";
import type { Flow } from "@trellis/api";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import type { createDraftRecovery } from "../../draftRecovery";
import type { DraftGraph } from "../../flowDraft";

export type AutosaveStatus = "saved" | "pending" | "saving" | "invalid" | "conflict" | "error";
const SAVE_DELAY_MS = 600;
type AutosaveOptions = {
	flow: Flow;
	graph: DraftGraph;
	canSave: boolean;
	initialSavedJson: string;
	recovery: ReturnType<typeof createDraftRecovery>;
	onSaved: (flow: Flow) => void;
};

// Browser storage keeps edits until the server confirms them. One request runs at a time.
export function useFlowAutosave({ flow, graph, canSave, initialSavedJson, recovery, onSaved }: AutosaveOptions) {
	const { client } = useApp();
	const json = useMemo(() => JSON.stringify(graph), [graph]);
	const [savedJson, setSavedJson] = useState(initialSavedJson);
	const [saving, setSaving] = useState(false);
	const [immediate, setImmediate] = useState(false);
	const [failure, setFailure] = useState<"conflict" | "error" | null>(null);
	const [message, setMessage] = useState("");

	useLayoutEffect(() => {
		if (json !== savedJson) recovery.write({ version: flow.version, graph });
		else if (!saving) recovery.clear();
	}, [json, savedJson, flow.version, graph, recovery, saving]);

	useEffect(() => {
		if (json === savedJson && !saving) {
			setImmediate(false);
			return;
		}
		if (!canSave || saving || failure !== null) return;
		const timer = setTimeout(
			() => {
				setSaving(true);
				client.flows.save({ flow: flow.id, ...graph, expectedVersion: flow.version }).then(
					(doc) => {
						recovery.acknowledge(graph, doc.flow.version);
						setSaving(false);
						setSavedJson(json);
						onSaved(doc.flow);
					},
					(error: unknown) => {
						setSaving(false);
						setFailure(error instanceof ORPCError && error.code === "FLOW_VERSION_CONFLICT" ? "conflict" : "error");
						setMessage(error instanceof Error ? error.message : String(error));
					},
				);
			},
			immediate ? 0 : SAVE_DELAY_MS,
		);
		return () => clearTimeout(timer);
	}, [json, savedJson, canSave, saving, immediate, failure, client, flow.id, flow.version, graph, onSaved, recovery]);

	const status: AutosaveStatus =
		failure ?? (saving ? "saving" : json === savedJson ? "saved" : canSave ? "pending" : "invalid");
	return {
		status,
		message,
		retry: () => setFailure(null),
		discardSubmission: () => {
			setFailure(null);
			setImmediate(false);
		},
		saveNow: () => {
			setImmediate(true);
			if (failure === "error") setFailure(null);
		},
	};
}
