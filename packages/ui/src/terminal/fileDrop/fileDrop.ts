import type { TerminalSnapshot, TerminalView } from "../TerminalSurface/terminalRuntime";

type DropState = TerminalSnapshot & { view: Pick<TerminalView, "readOnly" | "getPathForFile"> | null };

const canWrite = (state: DropState) =>
	state.view !== null &&
	!state.view.readOnly &&
	state.connection === "open" &&
	state.controllable &&
	!state.stopped &&
	!state.error;

export function fileDrop(state: () => DropState, insert: (text: string) => void) {
	const consumeFiles = (event: DragEvent) => {
		if (!event.dataTransfer?.types.includes("Files")) return false;
		event.preventDefault();
		event.stopPropagation();
		return true;
	};
	return {
		dragover(event: DragEvent) {
			if (!consumeFiles(event)) return;
			const current = state();
			event.dataTransfer!.dropEffect = canWrite(current) && current.view?.getPathForFile ? "copy" : "none";
		},
		drop(event: DragEvent) {
			if (!consumeFiles(event)) return;
			const current = state();
			const getPathForFile = current.view?.getPathForFile;
			if (!canWrite(current) || !getPathForFile) return;
			const paths = Array.from(event.dataTransfer!.files, getPathForFile);
			if (!paths.length || paths.some((path) => !path.startsWith("/") || /[\p{Cc}\p{Zl}\p{Zp}]/u.test(path))) return;
			insert(paths.map((path) => path.replace(/[^a-zA-Z0-9_./-]/gu, "\\$&")).join(" "));
		},
	};
}
