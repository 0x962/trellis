import type { TLShape } from "tldraw";
import type { AgentProfile } from "../../primitives/Avatar";
import type { PrGlyphProps } from "../PrGlyph";

export type WhiteboardOutput = {
	id: string;
	label: string;
} & (
	| {
			kind: "pull-request";
			title: string;
			url: string;
			state: PrGlyphProps["state"];
			askedForReview: boolean;
			locallyApproved: boolean;
	  }
	| { kind: "subagent"; profile: AgentProfile }
);

export type WhiteboardOutputEndpoint = { kind: "ticket" | "session" | "output"; id: string };
export type WhiteboardOutputLink = {
	from: WhiteboardOutputEndpoint;
	to: WhiteboardOutputEndpoint;
	label: "Sub-ticket" | "Session" | "Pull request" | "Subagent";
};

declare module "tldraw" {
	interface TLGlobalShapePropsMap {
		"trellis-output": { w: number; h: number; recordId: string; label: string; kind: "pull-request" | "subagent" };
	}
}
export type OutputShape = TLShape<"trellis-output">;
