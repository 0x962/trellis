import { X } from "@phosphor-icons/react";
import { useInbox } from "../../hooks/useInbox";
import { useSectionOpen } from "../../hooks/useSectionOpen";
import { InboxSection } from "../InboxSection";

// Tickets that are still open and whose open pull request has a failed
// check. A ticket that also waits in Review shows there only, so this
// section leaves it out of its rows and its count.
export function FailingCiSection() {
	const inbox = useInbox();
	const { open, toggle } = useSectionOpen("failingCi", true);
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
			rows={items}
		/>
	);
}
