import { StatusIcon } from "@trellis/ui";
import { ChevronDown } from "lucide-react";
import { formatCount } from "../../../../lib/format";
import { useInbox } from "../../hooks/useInbox";
import { useSectionOpen } from "../../hooks/useSectionOpen";
import { InboxSection } from "../InboxSection";

// What the agents finished in the last day. The section is awareness and not
// work, so it starts collapsed and keeps whatever the person chose.
export function DoneTodaySection() {
	const inbox = useInbox();
	const { open, toggle } = useSectionOpen("doneByAgentsToday", false);
	const section = inbox.data?.doneByAgentsToday;
	if (section === undefined || section.total === 0) return null;

	return (
		<InboxSection
			name="Done by agents today"
			total={section.total}
			icon={<StatusIcon category="done" />}
			hint={
				<>
					{open ? "Hide" : `Show ${formatCount(section.total)}`}
					<ChevronDown aria-hidden="true" className="size-3" />
				</>
			}
			open={open}
			onToggle={toggle}
			rows={section.items}
		/>
	);
}
