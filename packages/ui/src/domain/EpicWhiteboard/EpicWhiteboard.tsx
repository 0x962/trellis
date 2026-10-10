import { getAssetUrlsByImport } from "@tldraw/assets/imports.vite";
import { useEffect, useRef, useState } from "react";
import { type Editor, getSnapshot, Tldraw } from "tldraw";
import "tldraw/tldraw.css";
import "./whiteboard.css";
import { ConnectionTool } from "./ConnectionTool";
import { OutputHistoryControl } from "./components/OutputHistoryControl";
import { SubagentOutputSheet } from "./components/SubagentOutputSheet";
import { WaveNameDialog } from "./components/WaveNameDialog";
import { WhiteboardToolbar } from "./components/WhiteboardToolbar";
import { WhiteboardWaveControls } from "./components/WhiteboardWaveControls";
import { OutputShapeUtil } from "./OutputShapeUtil";
import { placeWhiteboardSessions } from "./placeWhiteboardSessions";
import { placeWhiteboardTickets } from "./placeWhiteboardTickets";
import { SessionShapeUtil } from "./SessionShapeUtil";
import { SessionTool } from "./SessionTool";
import { TicketShapeUtil } from "./TicketShapeUtil";
import { TicketTool } from "./TicketTool";
import { type EpicWhiteboardProps, whiteboardActions } from "./types";
import { WaveShapeUtil } from "./WaveShapeUtil";
import { WhiteboardContext } from "./whiteboardContext";
import { isCanonicalDependency, isDependencyShape } from "./whiteboardDependencies";
import { isCanonicalShape, isRecordShape, reconcileWhiteboard, waveShapeId } from "./whiteboardLayout";
import { isCanonicalOutput, isOutputLink, isOutputShape, reconcileWhiteboardOutputs } from "./whiteboardOutputLayout";
import { whiteboardOverrides, whiteboardShortcut } from "./whiteboardShortcuts";
import { placeWhiteboardWaves } from "./whiteboardWaveSelection";

const shapeUtils = [WaveShapeUtil, TicketShapeUtil, SessionShapeUtil, OutputShapeUtil];
const tools = [TicketTool, ConnectionTool, SessionTool];
const assetUrls = getAssetUrlsByImport();
const components = { ContextMenu: null, SharePanel: null };

export function EpicWhiteboard(props: EpicWhiteboardProps) {
	const [editor, setEditor] = useState<Editor | null>(null);
	const latest = useRef(props);
	latest.current = props;
	const reconciling = useRef(false);
	const cameraKey = `trellis-whiteboard-camera:${props.documentKey}`;

	useEffect(() => {
		if (!editor) return;
		whiteboardActions.set(editor, {
			onOpenTicket: (id) => latest.current.onOpenTicket(id),
			onCreateTicket: (point, waveId) => latest.current.onCreateTicket(point, waveId),
			onConnectTickets: (from, to) => latest.current.onConnectTickets(from, to),
			onCreateWave: (selection) => latest.current.onCreateWave(selection),
			onCreateSession: (point) => latest.current.onCreateSession(point),
			onOpenSession: (runId) => latest.current.onOpenSession(runId),
			onOpenOutput: (id) => latest.current.onOpenOutput(id),
		});
		const protectDelete = editor.sideEffects.registerBeforeDeleteHandler("shape", (shape) => {
			if (!reconciling.current && (isCanonicalShape(shape) || isCanonicalDependency(shape) || isCanonicalOutput(shape)))
				return false;
		});
		const protectCopies = editor.sideEffects.registerAfterCreateHandler("shape", (shape) => {
			if (isRecordShape(shape) && !isCanonicalShape(shape)) editor.store.remove([shape.id]);
			if (isDependencyShape(shape) && !isCanonicalDependency(shape)) editor.store.remove([shape.id]);
			if (isOutputShape(shape) && !isCanonicalOutput(shape)) editor.store.remove([shape.id]);
		});
		const protectRecord = editor.sideEffects.registerBeforeChangeHandler("shape", (previous, next) => {
			if (isCanonicalDependency(previous) || isOutputLink(previous)) return { ...next, isLocked: true };
			if (reconciling.current || (!isCanonicalShape(previous) && !isCanonicalOutput(previous))) return next;
			return { ...previous, x: next.x, y: next.y, index: next.index };
		});
		let previousRefs: string | undefined;
		const reportSessionRefs = () => {
			const ids = [
				...new Set(
					editor
						.getCurrentPageShapes()
						.flatMap((shape) => (shape.type === "trellis-session" && shape.props.sessionId ? [shape.props.runId] : [])),
				),
			].sort();
			const key = ids.join(",");
			if (key !== previousRefs) {
				previousRefs = key;
				latest.current.onSessionReferencesChange(ids);
			}
		};
		reportSessionRefs();
		const documentListener = editor.store.listen(
			() => {
				latest.current.onDocumentChange(getSnapshot(editor.store).document);
				reportSessionRefs();
			},
			{ source: "user", scope: "document" },
		);
		const cameraListener = editor.store.listen(
			() => {
				const { x, y, z } = editor.getCamera();
				localStorage.setItem(cameraKey, JSON.stringify({ x, y, z }));
			},
			{ scope: "session" },
		);
		return () => {
			documentListener();
			cameraListener();
			protectDelete();
			protectCopies();
			protectRecord();
			whiteboardActions.delete(editor);
		};
	}, [editor, cameraKey]);

	useEffect(() => {
		if (!editor) return;
		reconciling.current = true;
		reconcileWhiteboard(editor, props.waves, props.tickets);
		const wavesPlaced = placeWhiteboardWaves(editor, props.wavePlacements);
		if (props.outputsReady)
			editor.run(() => reconcileWhiteboardOutputs(editor, props.outputs, props.sessions, props.outputLinks), {
				history: "ignore",
				ignoreShapeLock: true,
			});
		reconciling.current = false;
		if (wavesPlaced.length > 0) latest.current.onWavesPlaced(wavesPlaced);
		const placed = placeWhiteboardTickets(editor, props.ticketPlacements);
		if (placed.length > 0) latest.current.onTicketsPlaced(placed);
	}, [
		editor,
		props.waves,
		props.tickets,
		props.ticketPlacements,
		props.wavePlacements,
		props.outputsReady,
		props.outputs,
		props.sessions,
		props.outputLinks,
	]);
	useEffect(() => {
		if (!editor || props.sessionPlacements.length === 0) return;
		latest.current.onSessionsPlaced(placeWhiteboardSessions(editor, props.sessionPlacements));
	}, [editor, props.sessionPlacements]);
	useEffect(() => {
		if (!editor || !props.focusWaveId) return;
		const bounds = editor.getShapePageBounds(waveShapeId(props.focusWaveId));
		if (bounds) editor.centerOnPoint({ x: bounds.center.x, y: bounds.y + 180 }, { animation: { duration: 0 } });
	}, [editor, props.focusWaveId]);
	useEffect(() => {
		editor?.updateInstanceState({ isReadonly: props.readOnly });
		editor?.user.updateUserPreferences({ colorScheme: props.colorScheme, animationSpeed: 0 });
	}, [editor, props.readOnly, props.colorScheme]);

	return (
		<WhiteboardContext
			value={{ tickets: props.tickets, waves: props.waves, sessions: props.sessions, outputs: props.outputs }}
		>
			<section
				className="trellis-whiteboard relative min-h-0 flex-1"
				aria-label="Epic whiteboard"
				onKeyDownCapture={(event) => editor && whiteboardShortcut(event, editor)}
				onKeyDown={(event) => {
					if (event.key === "Escape" && (event.target as HTMLElement).closest(".tl-container")) {
						event.preventDefault();
						event.stopPropagation();
					}
				}}
			>
				<Tldraw
					hideUi
					assetUrls={assetUrls}
					shapeUtils={shapeUtils}
					tools={tools}
					overrides={whiteboardOverrides}
					components={components}
					licenseKey={props.licenseKey}
					snapshot={props.snapshot ?? undefined}
					onMount={(mounted) => {
						reconcileWhiteboard(mounted, latest.current.waves, latest.current.tickets);
						const camera = localStorage.getItem(cameraKey);
						if (camera) mounted.setCamera(JSON.parse(camera));
						else mounted.zoomToFit({ animation: { duration: 0 } });
						setEditor(mounted);
					}}
				/>
				{editor && (
					<>
						<WhiteboardWaveControls editor={editor} waves={props.waves} focusWaveId={props.focusWaveId} />
						<WhiteboardToolbar editor={editor} readOnly={props.readOnly} />
					</>
				)}
				{props.waveDraft && <WaveNameDialog {...props.waveDraft} />}
				{props.subagentLoad && <OutputHistoryControl {...props.subagentLoad} />}
				{props.subagent && <SubagentOutputSheet {...props.subagent} />}
			</section>
		</WhiteboardContext>
	);
}
