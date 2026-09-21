import type { Check } from "@trellis/api";
import { ChecksLine } from "@trellis/ui/review";
import { openLink } from "../../../lib/openLink";
import { useCollapsedGroups } from "../../table/hooks/useCollapsedGroups/useCollapsedGroups";
import { checksForDisplay } from "./checksForDisplay";

// Every group opens. The Checks tab holds the checks and nothing else, so a
// group that starts shut would leave the tab almost empty. A person who
// shuts one keeps it shut for that pull request.
const openByDefault: string[] = [];

export function ReviewChecks({ checks, pr }: { checks: readonly Check[] | null; pr: string }) {
	const { isCollapsed, toggle } = useCollapsedGroups(`${pr}#checks`, openByDefault);
	return (
		<ChecksLine
			checks={checksForDisplay(checks ?? [])}
			loading={checks === null}
			isCollapsed={isCollapsed}
			onToggle={toggle}
			onOpenCheck={openLink}
		/>
	);
}
