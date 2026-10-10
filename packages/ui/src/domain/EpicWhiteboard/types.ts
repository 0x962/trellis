import type { ReactNode } from "react";
import type { Editor, TLShape, TLStoreSnapshot } from "tldraw";

export type WhiteboardCard = {
	id: string;
	label: string;
	waveId: string | null;
	content: ReactNode;
	matched: boolean;
	waitsOn: readonly string[];
};

export type WhiteboardWave = {
	id: string;
	label: string;
	count: string;
	current: boolean;
	content: ReactNode;
};

export type EpicWhiteboardProps = {
	documentKey: string;
	snapshot: TLStoreSnapshot | null;
	waves: readonly WhiteboardWave[];
	tickets: readonly WhiteboardCard[];
	readOnly: boolean;
	licenseKey?: string;
	focusWaveId?: string | null;
	colorScheme: "light" | "dark";
	onOpenTicket: (id: string) => void;
	onDocumentChange: (snapshot: TLStoreSnapshot) => void;
};

declare module "tldraw" {
	interface TLGlobalShapePropsMap {
		"trellis-ticket": { w: number; h: number; recordId: string };
		"trellis-wave": { w: number; h: number; recordId: string };
	}
}

export type TicketShape = TLShape<"trellis-ticket">;
export type WaveShape = TLShape<"trellis-wave">;
export type WhiteboardActions = Pick<EpicWhiteboardProps, "onOpenTicket">;
export const whiteboardActions = new WeakMap<Editor, WhiteboardActions>();
