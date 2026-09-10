import { useQuery } from "@tanstack/react-query";
import { StatusIcon } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../lib/appContext";
import { useInbox } from "../../hooks/useInbox";
import { useInboxActions } from "../../hooks/useInboxActions";
import { useSectionOpen } from "../../hooks/useSectionOpen";
import { InboxSection } from "../InboxSection";
import { StalledActions } from "./components/StalledActions";

// Tickets an agent started and left quiet for longer than the threshold in
// the settings. The header states the threshold it applied.
export function StalledSection() {
	const { orpc } = useApp();
	const inbox = useInbox();
	const settings = useQuery(orpc.settings.get.queryOptions({}));
	const { open, toggle } = useSectionOpen("stalled", true);
	const [focusedId, setFocusedId] = useState<string | null>(null);
	const { move, rowsWithLeaving, isSweeping } = useInboxActions();
	const section = inbox.data?.stalled;
	if (section === undefined || settings.data === undefined || section.total === 0) return null;

	return (
		<InboxSection
			name="Stalled"
			total={section.total}
			icon={<StatusIcon category="started" />}
			hint={`no activity for ${settings.data.stalledHours}h`}
			open={open}
			onToggle={toggle}
			rows={rowsWithLeaving(section.items)}
			focusedId={focusedId}
			onRowActive={(ticket) => setFocusedId(ticket.identifier)}
			isSweeping={isSweeping}
			renderActions={(ticket) => (
				<StalledActions ticket={ticket} onMoveToTodo={() => move(ticket, "todo", section.items.indexOf(ticket))} />
			)}
		/>
	);
}
