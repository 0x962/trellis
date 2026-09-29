import type { AgentRun } from "@trellis/api";
import { type LinkPress, SessionStatusPane, type SessionUpdates } from "@trellis/ui";
import type { ReactNode } from "react";
import { ReadOnlyMarkdown } from "../../../../../components/ReadOnlyMarkdown";
import { agentStatusLinkPress, sessionStatusProcessState } from "./agentStatusUpdatesState";

const renderStatusMarkdown = (markdown: string): ReactNode => <ReadOnlyMarkdown markdown={markdown} />;

export function AgentStatusUpdatesPane({
	run,
	updates,
	now,
	observerError,
	onOpenLink,
	renderMarkdown = renderStatusMarkdown,
}: {
	run: AgentRun;
	updates: SessionUpdates;
	now: string;
	observerError: string | null;
	onOpenLink: (href: string, press: LinkPress) => void;
	renderMarkdown?: (markdown: string) => ReactNode;
}) {
	return (
		<SessionStatusPane
			updates={updates}
			processState={sessionStatusProcessState(run)}
			now={now}
			observerError={observerError}
			renderMarkdown={renderMarkdown}
			onOpenLink={(href, target, press) => onOpenLink(href, agentStatusLinkPress(target, press))}
		/>
	);
}
