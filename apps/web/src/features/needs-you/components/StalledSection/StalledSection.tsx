import { useQuery } from "@tanstack/react-query";
import { StatusIcon } from "@trellis/ui";
import { useApp } from "../../../../lib/appContext";
import { useInbox } from "../../hooks/useInbox";
import { useSectionOpen } from "../../hooks/useSectionOpen";
import { InboxSection } from "../InboxSection";

// Tickets an agent started and left quiet for longer than the threshold in
// the settings. The header states the threshold it applied.
export function StalledSection() {
	const { orpc } = useApp();
	const inbox = useInbox();
	const settings = useQuery(orpc.settings.get.queryOptions({}));
	const { open, toggle } = useSectionOpen("stalled", true);
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
			rows={section.items}
		/>
	);
}
