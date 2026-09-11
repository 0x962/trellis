import { StatusIcon } from "@trellis/ui";
import { useInbox } from "../../hooks/useInbox";
import { useSectionOpen } from "../../hooks/useSectionOpen";
import { InboxSection } from "../InboxSection";

// Tickets in a human-reviewer status, oldest waiting first. A row opens the
// ticket page, and the person reviews the ticket there.
export function ReviewSection() {
	const inbox = useInbox();
	const { open, toggle } = useSectionOpen("review", true);
	const section = inbox.data?.review;
	if (section === undefined || section.total === 0) return null;
	const items = section.items;

	return (
		<InboxSection
			name="Review"
			total={section.total}
			icon={<StatusIcon category="review" />}
			// A section of one status repeats it on every row, so the column
			// shows only when the rows mix statuses.
			showStatus={new Set(items.map((row) => row.status.id)).size > 1}
			open={open}
			onToggle={toggle}
			rows={items}
		/>
	);
}
