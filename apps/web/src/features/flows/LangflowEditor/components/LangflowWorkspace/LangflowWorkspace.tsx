import { ArrowClockwise, FloppyDisk, SlidersHorizontal } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { FlowDocumentV1 } from "@trellis/api";
import { FailureState, Tooltip } from "@trellis/ui";
import { useCallback, useRef, useState } from "react";
import { EditorContentSchema } from "../../../../../../../../integrations/langflow/editor/protocol";
import { useApp } from "../../../../../lib/appContext";
import type { DraftStore } from "../../../../../lib/draftTransfer/types";
import { PageTitle } from "../../../../shell/PageTitle";
import { Topbar, TopbarActionButton } from "../../../../shell/Topbar";
import { FlowSettingsSheet } from "../../../FlowEditor/components/FlowSettingsSheet";
import { useDocumentAutosave } from "../../../FlowEditor/hooks/useFlowAutosave";
import { LangflowEditor, type LangflowEditorHandle, type LangflowEditorSession } from "../../LangflowEditor";

type Props = {
	document: Extract<FlowDocumentV1, { engine: "langflow" }>;
	session: LangflowEditorSession;
	storage: DraftStore;
	tab: string;
	grantActive: boolean;
	readOnly: boolean;
	currentIdentity: () => { host: string; actor: string };
};

export function LangflowWorkspace(props: Props) {
	return <Workspace key={props.session.channel} {...props} />;
}

function Workspace({ document, session, storage, tab, grantActive, readOnly, currentIdentity }: Props) {
	const { client } = useApp();
	const editor = useRef<LangflowEditorHandle>(null);
	const ended = useRef(false);
	const [accessEnded, setAccessEnded] = useState(false);
	const [flow, setFlow] = useState(document.flow);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const canDispatch = () => {
		const current = currentIdentity();
		return (
			!ended.current &&
			grantActive &&
			Date.now() < Date.parse(session.expiresAt) &&
			current.host === session.identity.host &&
			current.actor === session.identity.actor
		);
	};
	const autosave = useDocumentAutosave({
		identity: { host: session.identity.host, actor: session.identity.actor, flow: document.flow.id, tab },
		document,
		storage,
		active: grantActive && !accessEnded,
		readOnly,
		canDispatch,
		save: (request) => client.flowDocumentsV1.save(request),
	});
	const endAccess = useCallback(() => {
		ended.current = true;
		autosave.suspend();
		setAccessEnded(true);
	}, [autosave.suspend]);
	const { state } = autosave;
	const snapshot = state.kind === "ready" ? state.snapshot : null;
	const content = snapshot === null ? null : readContent(snapshot.draft.contentJson);
	const status =
		state.kind === "loading"
			? "Read the browser draft"
			: state.kind === "unavailable"
				? "The browser draft is unavailable"
				: snapshot?.failure === "storage"
					? "The browser could not retain the draft"
					: snapshot?.failure === "conflict"
						? "The flow changed in another window"
						: snapshot?.failure === "network"
							? "The save failed"
							: snapshot?.failure === "unsupported"
								? "The draft format is unsupported"
								: snapshot?.saving
									? "Save in progress"
									: snapshot?.saved
										? "Saved"
										: "Pending save";
	return (
		<>
			<Topbar
				actions={
					<>
						<span role="status" className="text-xs tabular-nums text-fg-muted">
							{status}
						</span>
						{(snapshot?.failure === "network" || snapshot?.failure === "storage") && (
							<Tooltip content="Retry the save">
								<TopbarActionButton
									label="Retry the save"
									icon={<ArrowClockwise />}
									onClick={() => void autosave.retry()}
									disabled={!canDispatch() || readOnly}
								/>
							</Tooltip>
						)}
						<Tooltip content="Save the flow">
							<TopbarActionButton
								label="Save the flow"
								icon={<FloppyDisk />}
								onClick={() => void autosave.saveNow()}
								disabled={
									snapshot === null || snapshot.saved || snapshot.failure !== null || !canDispatch() || readOnly
								}
							/>
						</Tooltip>
						<Tooltip content="Flow settings">
							<TopbarActionButton
								label="Flow settings"
								icon={<SlidersHorizontal />}
								onClick={() => setSettingsOpen(true)}
								disabled={readOnly}
							/>
						</Tooltip>
					</>
				}
			>
				<PageTitle parent={<Link to="/ai/flows">Flows</Link>} title={flow.name} />
			</Topbar>
			<div className="page-card relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
				{state.kind === "loading" ? (
					<p role="status" className="p-4 text-sm text-fg-muted">
						Read the browser draft.
					</p>
				) : state.kind === "unavailable" ||
					!content?.success ||
					content.data.componentManifestHash !== session.identity.componentManifestHash ? (
					<FailureState title="The draft cannot open" description="Preserve the browser draft before you replace it." />
				) : readOnly ? (
					<FailureState title="This flow is read-only" description="The editor cannot change this flow." />
				) : (
					<LangflowEditor
						ref={editor}
						session={{ ...session, content: content.data }}
						grantActive={canDispatch()}
						draftChanged={autosave.draftChanged}
						selectionChanged={() => {}}
						onAccessEnded={endAccess}
					/>
				)}
			</div>
			{settingsOpen && (
				<FlowSettingsSheet
					flow={flow}
					onSaved={setFlow}
					onClose={() => {
						setSettingsOpen(false);
						requestAnimationFrame(() => editor.current?.restoreFocus());
					}}
				/>
			)}
		</>
	);
}

function readContent(bytes: string) {
	try {
		return EditorContentSchema.safeParse(JSON.parse(bytes));
	} catch {
		return null;
	}
}
