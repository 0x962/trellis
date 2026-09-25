import { internalLink, type PageDetail as PageRecord } from "@trellis/api";
import { Button, Input, Sheet, SheetBody, SheetFooter } from "@trellis/ui";
import type { RefObject } from "react";
import { copyText } from "../../../../../lib/clipboard";

export function PageShare({
	page,
	onClose,
	finalFocus,
}: {
	page: PageRecord;
	onClose: () => void;
	finalFocus: RefObject<HTMLButtonElement | null>;
}) {
	const href = internalLink("page", page.id);
	return (
		<Sheet
			finalFocus={finalFocus}
			open
			title="Share Page"
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<SheetBody>
				<p className="text-sm text-fg-muted">This link follows the Page if its title, project, or address changes.</p>
				<Input label="Trellis link" value={href} readOnly />
			</SheetBody>
			<SheetFooter>
				<Button onClick={() => void copyText(href, "Page link copied")}>Copy link</Button>
			</SheetFooter>
		</Sheet>
	);
}
