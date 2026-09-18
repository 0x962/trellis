import { DotsThree } from "@phosphor-icons/react";
import { useRouter } from "@tanstack/react-router";
import type { Ticket } from "@trellis/api";
import { Button, Dialog, IconButton, Menu, Tooltip } from "@trellis/ui";
import { useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { copyText } from "../../../../../lib/clipboard";
import { failToast } from "../../../../../lib/failToast";
import { lastListHref } from "../../../../../lib/lastList";
import { usePageSheet } from "../../../../shell/PageSheet";
import { branchName, titleSlug } from "../../../PropertiesRail/utils/branchName";
import { openPicker } from "../../../stores/pickerStore";
import { useCopyBrief } from "../BriefCopy";

export type MoreMenuProps = {
	ticket: Ticket;
};

export const ticketLink = (identifier: string) => `${window.location.origin}/t/${identifier}`;

// The rest of the ticket actions: the three copies, the two pickers the
// rail draws, and Delete behind a confirm.
export function MoreMenu({ ticket }: MoreMenuProps) {
	const { client, queryClient } = useApp();
	const router = useRouter();
	const sheet = usePageSheet();
	const copyBrief = useCopyBrief(ticket);
	const [confirming, setConfirming] = useState(false);
	const branch = branchName(ticket.identifier, titleSlug(ticket.title));

	const remove = async () => {
		try {
			await client.tickets.delete({ ticket: ticket.identifier });
			setConfirming(false);
			await queryClient.invalidateQueries();
			// A ticket in a `PageSheet` closes the sheet, and the page under it
			// stays. A ticket on its route returns to the last list.
			if (sheet !== null) sheet.close();
			else void router.navigate({ href: lastListHref() });
		} catch (error) {
			failToast(`${ticket.identifier} is not deleted.`, error, () => void remove());
		}
	};

	return (
		<>
			<Tooltip content="More actions">
				<Menu
					label="More actions"
					trigger={<IconButton label="More actions" variant="default" icon={<DotsThree />} />}
					items={[
						{ label: "Copy brief", onSelect: () => void copyBrief() },
						{ label: "Copy branch name", onSelect: () => void copyText(branch, "Copied the branch name") },
						{ label: "Copy link", onSelect: () => void copyText(ticketLink(ticket.identifier), "Copied the link") },
						{ label: "Move to project", onSelect: () => openPicker("project") },
						{ label: "Set parent", onSelect: () => openPicker("parent") },
						{ label: "Delete", onSelect: () => setConfirming(true), danger: true },
					]}
				/>
			</Tooltip>
			<Dialog
				open={confirming}
				onOpenChange={setConfirming}
				title={`Delete ${ticket.identifier}?`}
				description="trellis also deletes its comments, attachments, and PR links. Its sub-tickets stay and lose their parent."
			>
				<div className="flex justify-end gap-2">
					<Button variant="quiet" onClick={() => setConfirming(false)}>
						Cancel
					</Button>
					<Button variant="danger" onClick={() => void remove()}>
						Delete
					</Button>
				</div>
			</Dialog>
		</>
	);
}
