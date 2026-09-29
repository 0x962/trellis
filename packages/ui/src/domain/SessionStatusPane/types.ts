import type { ReactNode } from "react";
import type { LinkPress } from "../../utils/linkPress";

export type SessionUpdateEmbed = {
	title: string;
	html: string;
};

export type SessionUpdate = {
	id: string;
	sessionId: string;
	runId: string;
	requestId: string | null;
	body: string;
	embeds: SessionUpdateEmbed[];
	createdAt: string;
};

export type SessionUpdateRequestState = "pending" | "sent" | "answered" | "failed";

export type SessionUpdateRequest = {
	requestId: string;
	requestedAt: string;
	state: SessionUpdateRequestState;
	error: string | null;
};

export type SessionUpdates = {
	latest: SessionUpdate | null;
	previous: SessionUpdate | null;
	request: SessionUpdateRequest | null;
};

export type SessionStatusProcessState = "active" | "paused" | "completed";

export type SessionStatusPaneProps = {
	updates: SessionUpdates;
	processState: SessionStatusProcessState;
	now: string;
	renderMarkdown: (markdown: string) => ReactNode;
	onOpenLink: (href: string, target: string, press: LinkPress) => void;
	lateAfterMs?: number;
	className?: string;
};
