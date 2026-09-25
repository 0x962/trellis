import type { PageDetail as PageRecord } from "@trellis/api";
import { Button, ChoiceGroup, Input, Sheet, SheetBody, SheetFooter } from "@trellis/ui";
import type { RefObject } from "react";
import { useState } from "react";
import { copyText } from "../../../../../lib/clipboard";
import { pageVersionHref } from "../../pageLink";

export function PageShare({
	page,
	onClose,
	finalFocus,
}: {
	page: PageRecord;
	onClose: () => void;
	finalFocus: RefObject<HTMLButtonElement | null>;
}) {
	const [choice, setChoice] = useState<"latest" | "version">("latest");
	const href = new URL(
		pageVersionHref(page.projectKey, page.slug, choice === "latest" ? undefined : page.requestedVersion.number),
		location.origin,
	).href;
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
				<p className="text-sm text-fg-muted">This link requires access to the same Trellis server.</p>
				<ChoiceGroup
					label="Link target"
					value={choice}
					onValueChange={setChoice}
					options={[
						{ value: "latest", label: "Latest", description: "The link follows new versions." },
						{
							value: "version",
							label: `Version ${page.requestedVersion.number}`,
							description: "The link keeps the version on screen.",
						},
					]}
				/>
				<Input label="Trellis link" value={href} readOnly />
			</SheetBody>
			<SheetFooter>
				<Button onClick={() => void copyText(href, "Page link copied")}>Copy link</Button>
			</SheetFooter>
		</Sheet>
	);
}
