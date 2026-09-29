import type { ReactNode } from "react";

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

export type SessionStatusLink = {
	href: string;
	newWindow: boolean;
	metaKey: boolean;
	ctrlKey: boolean;
	shiftKey: boolean;
	altKey: boolean;
};

export type SessionStatusPaneProps = {
	updates: SessionUpdates;
	processState: SessionStatusProcessState;
	now: string;
	renderMarkdown: (markdown: string) => ReactNode;
	onLink: (link: SessionStatusLink) => void;
	lateAfterMs?: number;
	className?: string;
};
