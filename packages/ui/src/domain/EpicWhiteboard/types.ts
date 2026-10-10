import type { ReactNode } from "react";
import type { Editor, TLShape, TLShapeId, TLStoreSnapshot } from "tldraw";
import type { AgentMarkState } from "../../primitives/AgentMark";
import type { AgentProfile, AvatarProps } from "../../primitives/Avatar";
import type { WhiteboardOutput, WhiteboardOutputLink } from "./outputTypes";

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

export type WhiteboardPoint = { x: number; y: number };
export type WhiteboardTicketPlacement = WhiteboardPoint & { ticketId: string };
export type WhiteboardWaveSelection = {
	ticketIds: string[];
	shapes: (WhiteboardPoint & { id: TLShapeId })[];
	bounds: WhiteboardPoint & { w: number; h: number };
};
export type WhiteboardWavePlacement = WhiteboardWaveSelection & { waveId: string };
export type WhiteboardSession = {
	id: string;
	label: string;
	profile: AgentProfile;
	state: AgentMarkState;
	status?: AvatarProps["status"];
};
export type WhiteboardSessionPlacement = WhiteboardPoint & { runId: string; sessionId: string; label: string };

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
	onCreateTicket: (point: WhiteboardPoint, waveId: string | null) => void;
	onConnectTickets: (prerequisiteId: string, dependentId: string) => void;
	onCreateWave: (selection: WhiteboardWaveSelection) => void;
	onCreateSession: (point: WhiteboardPoint) => void;
	onOpenSession: (runId: string) => void;
	sessions: readonly WhiteboardSession[];
	sessionPlacements: readonly WhiteboardSessionPlacement[];
	onSessionsPlaced: (ids: string[]) => void;
	onSessionReferencesChange: (ids: string[]) => void;
	outputs: readonly WhiteboardOutput[];
	outputLinks: readonly WhiteboardOutputLink[];
	outputsReady: boolean;
	onOpenOutput: (id: string) => void;
	subagent: {
		detail: {
			prompt: string | null;
			output: string | null;
			state: string;
			observedAt: string;
			providerChildIds: readonly string[];
		} | null;
		onClose: () => void;
		onOpenSource: () => void;
	} | null;
	subagentLoad: { pending: boolean; partial: boolean; more: boolean; load: () => void } | null;
	wavePlacements: readonly WhiteboardWavePlacement[];
	onWavesPlaced: (ids: string[]) => void;
	waveDraft: {
		name: string;
		ticketCount: number;
		busy: boolean;
		error?: string;
		onCreate: (name: string) => void;
		onClose: () => void;
	} | null;
	ticketPlacements: readonly WhiteboardTicketPlacement[];
	onTicketsPlaced: (ids: string[]) => void;
	onDocumentChange: (snapshot: TLStoreSnapshot) => void;
};

declare module "tldraw" {
	interface TLGlobalShapePropsMap {
		"trellis-ticket": { w: number; h: number; recordId: string };
		"trellis-wave": { w: number; h: number; recordId: string };
		"trellis-session": { w: number; h: number; runId: string; sessionId: string; label: string };
	}
}

export type TicketShape = TLShape<"trellis-ticket">;
export type WaveShape = TLShape<"trellis-wave">;
export type SessionShape = TLShape<"trellis-session">;
export type WhiteboardActions = Pick<
	EpicWhiteboardProps,
	| "onOpenTicket"
	| "onCreateTicket"
	| "onConnectTickets"
	| "onCreateWave"
	| "onCreateSession"
	| "onOpenSession"
	| "onOpenOutput"
>;
export const whiteboardActions = new WeakMap<Editor, WhiteboardActions>();
