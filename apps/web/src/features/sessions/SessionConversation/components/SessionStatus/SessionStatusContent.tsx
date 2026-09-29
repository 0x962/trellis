import type { AgentRun, SessionUpdates } from "@trellis/api";
import { type LinkPress, SessionStatusPane } from "@trellis/ui";
import type { ReactNode } from "react";
import { ReadOnlyMarkdown } from "../../../../../components/ReadOnlyMarkdown";
import { sessionStatusProcessState, statusLinkPress } from "./sessionStatusState";

const renderStatusMarkdown = (markdown: string): ReactNode => <ReadOnlyMarkdown markdown={markdown} />;

export function SessionStatusContent({
	run,
	updates,
	now,
	onOpenLink,
	renderMarkdown = renderStatusMarkdown,
}: {
	run: AgentRun;
	updates: SessionUpdates;
	now: string;
	onOpenLink: (href: string, press: LinkPress) => void;
	renderMarkdown?: (markdown: string) => ReactNode;
}) {
	return (
		<SessionStatusPane
			updates={updates}
			processState={sessionStatusProcessState(run)}
			now={now}
			renderMarkdown={renderMarkdown}
			onOpenLink={(href, target, press) => onOpenLink(href, statusLinkPress(target, press))}
		/>
	);
}
