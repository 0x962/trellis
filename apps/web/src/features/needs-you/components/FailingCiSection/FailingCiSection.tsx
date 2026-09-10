import { X } from "lucide-react";
import { useState } from "react";
import { useInbox } from "../../hooks/useInbox";
import { useInboxActions } from "../../hooks/useInboxActions";
import { useSectionOpen } from "../../hooks/useSectionOpen";
import { InboxSection } from "../InboxSection";
import { FailingChecks } from "./components/FailingChecks";
import { FailingCiActions } from "./components/FailingCiActions";

// Tickets that are still open and whose open pull request fails a check.
export function FailingCiSection() {
	const inbox = useInbox();
	const { open, toggle } = useSectionOpen("failingCi", true);
	const [focusedId, setFocusedId] = useState<string | null>(null);
	const { rowsWithLeaving, isSweeping } = useInboxActions();
	const section = inbox.data?.failingCi;
	if (section === undefined || section.total === 0) return null;

	return (
		<InboxSection
			name="Failing checks"
			total={section.total}
			icon={<X className="text-danger" />}
			open={open}
			onToggle={toggle}
			rows={rowsWithLeaving(section.items)}
			focusedId={focusedId}
			onRowActive={(ticket) => setFocusedId(ticket.identifier)}
			isSweeping={isSweeping}
			renderMeta={(ticket) => <FailingChecks ticket={ticket} />}
			renderActions={(ticket) => <FailingCiActions ticket={ticket} />}
		/>
	);
}
