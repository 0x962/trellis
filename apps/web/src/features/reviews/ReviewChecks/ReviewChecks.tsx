import type { Check } from "@trellis/api";
import { ChecksLine } from "@trellis/ui/review";
import { openLink } from "../../../lib/openLink";
import { useCollapsedGroups } from "../../table/hooks/useCollapsedGroups/useCollapsedGroups";
import { checksForDisplay } from "./checksForDisplay";

const collapsedDefaults = ["neutral", "success", "skipped"];

export function ReviewChecks({ checks, pr }: { checks: readonly Check[] | null; pr: string }) {
	const { isCollapsed, toggle } = useCollapsedGroups(`${pr}#checks`, collapsedDefaults);
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
