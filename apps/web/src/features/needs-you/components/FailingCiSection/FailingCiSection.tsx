import { X } from "lucide-react";
import { useState } from "react";
import { useInbox } from "../../hooks/useInbox";
import { useInboxActions } from "../../hooks/useInboxActions";
import { useSectionOpen } from "../../hooks/useSectionOpen";
import { FailingChecks } from "../FailingChecks";
import { InboxSection } from "../InboxSection";
import { FailingCiActions } from "./components/FailingCiActions";

// Tickets that are still open and whose open PR has a failed check. A ticket
// that also waits in Review shows there only, with its failed-check chip, so
// this section leaves it out of its rows and its count (spec T9 item 5).
export function FailingCiSection() {
	const inbox = useInbox();
	const { open, toggle } = useSectionOpen("failingCi", true);
	const [focusedId, setFocusedId] = useState<string | null>(null);
	const { rowsWithLeaving, isSweeping } = useInboxActions();
	const section = inbox.data?.failingCi;
	if (section === undefined) return null;
	const inReview = new Set(inbox.data?.review.items.map((item) => item.id));
	const items = section.items.filter((item) => !inReview.has(item.id));
	const total = section.total - (section.items.length - items.length);
	if (total === 0) return null;

	return (
		<InboxSection
			name="Failing checks"
			total={total}
			icon={<X className="text-danger" />}
			open={open}
			onToggle={toggle}
			rows={rowsWithLeaving(items)}
			focusedId={focusedId}
			onRowActive={(ticket) => setFocusedId(ticket.identifier)}
			isSweeping={isSweeping}
			renderMeta={(ticket) => <FailingChecks ticket={ticket} />}
			renderActions={(ticket) => <FailingCiActions ticket={ticket} />}
		/>
	);
}
