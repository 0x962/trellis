import { pendingDocumentV1Example } from "@trellis/api";
import { act, StrictMode } from "react";
import { createRoot } from "test-renderer";
import {
	type DocumentAutosaveOptions,
	useDocumentAutosave,
} from "../../../FlowEditor/hooks/useFlowAutosave/useDocumentAutosave";
import { content, draft, memoryStore, receipt } from "../../fixtures/fixtures";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export async function mountedDraft(overrides: Partial<DocumentAutosaveOptions> = {}) {
	const memory = memoryStore();
	let options: DocumentAutosaveOptions = {
		identity: draft().identity,
		document: { ...pendingDocumentV1Example, ...content("saved") } as DocumentAutosaveOptions["document"],
		storage: memory.storage,
		save: async (request) => receipt(request),
		active: true,
		readOnly: false,
		canDispatch: () => true,
		...overrides,
	};
	let value!: ReturnType<typeof useDocumentAutosave>;
	function Probe() {
		value = useDocumentAutosave(options);
		return <output>{value.state.kind === "ready" ? JSON.stringify(value.state.snapshot) : value.state.kind}</output>;
	}
	const root = createRoot();
	const render = async (next: Partial<DocumentAutosaveOptions> = {}) => {
		options = { ...options, ...next };
		await act(async () =>
			root.render(
				<StrictMode>
					<Probe />
				</StrictMode>,
			),
		);
	};
	await render();
	return {
		memory,
		options: () => options,
		value: () => value,
		snapshot: () => {
			if (value.state.kind !== "ready") throw new Error(`Draft is ${value.state.kind}.`);
			return value.state.snapshot;
		},
		render,
		edit: (text: string) => act(async () => value.draftChanged(content(text))),
		flush: () =>
			act(async () => {
				await value.saveNow();
			}),
		retry: () =>
			act(async () => {
				await value.retry();
			}),
		detach: () => act(async () => root.render(<div />)),
		close: () => act(async () => root.unmount()),
	};
}

export const settleEffects = () =>
	act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 650));
	});
