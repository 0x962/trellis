import { Archive, ArrowClockwise, FloppyDisk, SlidersHorizontal } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import type { FlowDocumentV1 } from "@trellis/api";
import { FailureState, Tooltip } from "@trellis/ui";
import { useCallback, useMemo, useRef, useState } from "react";
import { EditorContentSchema } from "../../../../../../../../integrations/langflow/editor/protocol";
import { useApp } from "../../../../../lib/appContext";
import type { DraftStore } from "../../../../../lib/draftTransfer/types";
import { PageTitle } from "../../../../shell/PageTitle";
import { Topbar, TopbarActionButton } from "../../../../shell/Topbar";
import { FlowSettingsSheet } from "../../../FlowEditor/components/FlowSettingsSheet";
import { useDocumentAutosave } from "../../../FlowEditor/hooks/useFlowAutosave";
import { createDocumentRecovery } from "../../../langflowDrafts/documentRecovery";
import { LangflowEditor, type LangflowEditorHandle, type LangflowEditorSession } from "../../LangflowEditor";
import { type DocumentDraftCopy, DocumentDraftDialog } from "../DocumentDraftDialog";

type Props = {
	document: Extract<FlowDocumentV1, { engine: "langflow" }>;
	session: LangflowEditorSession;
	storage: DraftStore;
	tab: string;
	grantActive: boolean;
	readOnly: boolean;
	currentIdentity: () => { host: string | null; actor: string | null };
	onOpenDraft: (tab: string) => Promise<void>;
};

export function LangflowWorkspace(props: Props) {
	return <Workspace key={props.session.channel} {...props} />;
}

function Workspace({ document, session, storage, tab, grantActive, readOnly, currentIdentity, onOpenDraft }: Props) {
	const { client } = useApp();
	const editor = useRef<LangflowEditorHandle>(null);
	const ended = useRef(false);
	const [accessEnded, setAccessEnded] = useState(false);
	const [flow, setFlow] = useState(document.flow);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [copies, setCopies] = useState<DocumentDraftCopy[] | null>(null);
	const [recoveryError, setRecoveryError] = useState("");
	const identity = useMemo(
		() => ({ host: session.identity.host, actor: session.identity.actor, flow: document.flow.id, tab }),
		[session.identity.host, session.identity.actor, document.flow.id, tab],
	);
	const recovery = useMemo(() => createDocumentRecovery(storage, identity), [storage, identity]);
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
		identity,
		document,
		storage,
		active: grantActive && !accessEnded,
		readOnly,
		canDispatch,
		save: (request) => client.flowDocumentsV1.save(request, { context: { editorChannel: session.channel } }),
	});
	const endAccess = useCallback(() => {
		ended.current = true;
		autosave.suspend();
		setAccessEnded(true);
	}, [autosave.suspend]);
	const { state } = autosave;
	const snapshot = state.kind === "ready" ? state.snapshot : null;
	const latestFlow = snapshot?.receipt && snapshot.receipt.flow.version > flow.version ? snapshot.receipt.flow : flow;
	const content = snapshot === null ? null : readContent(snapshot.draft.contentJson);
	const showDrafts = () => {
		const bytes = autosave.exportDraft() ?? (state.kind === "unavailable" ? state.bytes : null);
		const current = bytes === null ? [] : [{ identity, bytes }];
		setRecoveryError("");
		try {
			setCopies([...current, ...recovery.list().filter((copy) => bytes === null || copy.identity.tab !== tab)]);
		} catch (error) {
			setCopies(current);
			setRecoveryError(error instanceof Error ? error.message : String(error));
		}
	};
	const changeDraft = async (copy: DocumentDraftCopy, discard: boolean) => {
		setRecoveryError("");
		try {
			if (snapshot?.saving) throw new Error("Wait for the current save before you change drafts.");
			const nextTab = crypto.randomUUID();
			if (discard) {
				if (copy.identity.tab === tab && state.kind === "ready") autosave.discard(copy.bytes);
				else recovery.discard(copy.identity, copy.bytes);
				if (copy.identity.tab !== tab) {
					showDrafts();
					return;
				}
			} else recovery.recover(copy.identity, copy.bytes, nextTab);
			endAccess();
			await onOpenDraft(nextTab);
			setCopies(null);
		} catch (error) {
			setRecoveryError(error instanceof Error ? error.message : String(error));
		}
	};
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
						{!canDispatch() && (
							<Tooltip content="Reopen the editor">
								<TopbarActionButton
									label="Reopen the editor"
									icon={<ArrowClockwise />}
									onClick={() => void onOpenDraft(tab)}
									disabled={snapshot?.saving ?? false}
								/>
							</Tooltip>
						)}
						<Tooltip content="Browser drafts">
							<TopbarActionButton label="Browser drafts" icon={<Archive />} onClick={showDrafts} />
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
				<PageTitle parent={<Link to="/ai/flows">Flows</Link>} title={latestFlow.name} />
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
			{copies !== null && (
				<DocumentDraftDialog
					copies={copies}
					error={recoveryError}
					busy={snapshot?.saving ?? false}
					readOnly={readOnly}
					onClose={() => {
						setCopies(null);
						requestAnimationFrame(() => editor.current?.restoreFocus());
					}}
					onRecover={(copy) => changeDraft(copy, false)}
					onDiscard={(copy) => changeDraft(copy, true)}
				/>
			)}
			{settingsOpen && (
				<FlowSettingsSheet
					flow={latestFlow}
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
