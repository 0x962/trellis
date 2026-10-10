import { getAssetUrlsByImport } from "@tldraw/assets/imports.vite";
import { useEffect, useRef, useState } from "react";
import { type Editor, getSnapshot, Tldraw } from "tldraw";
import "tldraw/tldraw.css";
import "./whiteboard.css";
import { WhiteboardToolbar } from "./components/WhiteboardToolbar";
import { WhiteboardWaveControls } from "./components/WhiteboardWaveControls";
import { TicketShapeUtil } from "./TicketShapeUtil";
import { type EpicWhiteboardProps, whiteboardActions } from "./types";
import { WaveShapeUtil } from "./WaveShapeUtil";
import { WhiteboardContext } from "./whiteboardContext";
import { isCanonicalDependency, isDependencyShape } from "./whiteboardDependencies";
import { isCanonicalShape, isRecordShape, reconcileWhiteboard, waveShapeId } from "./whiteboardLayout";

const shapeUtils = [WaveShapeUtil, TicketShapeUtil];
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
		whiteboardActions.set(editor, { onOpenTicket: (id) => latest.current.onOpenTicket(id) });
		const protectDelete = editor.sideEffects.registerBeforeDeleteHandler("shape", (shape) => {
			if (!reconciling.current && (isCanonicalShape(shape) || isCanonicalDependency(shape))) return false;
		});
		const protectCopies = editor.sideEffects.registerAfterCreateHandler("shape", (shape) => {
			if (isRecordShape(shape) && !isCanonicalShape(shape)) editor.store.remove([shape.id]);
			if (isDependencyShape(shape) && !isCanonicalDependency(shape)) editor.store.remove([shape.id]);
		});
		const protectRecord = editor.sideEffects.registerBeforeChangeHandler("shape", (previous, next) => {
			if (isCanonicalDependency(previous)) return { ...next, isLocked: true };
			if (reconciling.current || !isCanonicalShape(previous)) return next;
			return { ...previous, x: next.x, y: next.y, index: next.index };
		});
		const documentListener = editor.store.listen(
			() => latest.current.onDocumentChange(getSnapshot(editor.store).document),
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
		reconciling.current = false;
	}, [editor, props.waves, props.tickets]);
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
		<WhiteboardContext value={{ tickets: props.tickets, waves: props.waves }}>
			<section
				className="trellis-whiteboard relative min-h-0 flex-1"
				aria-label="Epic whiteboard"
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
			</section>
		</WhiteboardContext>
	);
}
