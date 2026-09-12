import type { Ticket } from "@trellis/api";
import { useHotkey } from "@trellis/ui";
import { useCallback } from "react";
import { useApp } from "../../../../../lib/appContext";
import { copyText } from "../../../../../lib/clipboard";

// Copies the brief `trellis brief <id>` prints: the markdown an agent
// starts from.
export const useCopyBrief = (ticket: Pick<Ticket, "identifier">) => {
	const { client } = useApp();
	return useCallback(async () => {
		const { markdown } = await client.brief.get({ ticket: ticket.identifier });
		await copyText(markdown, `Copied the brief of ${ticket.identifier}`);
	}, [client, ticket.identifier]);
};

export type BriefCopyProps = {
	ticket: Pick<Ticket, "identifier">;
};

// Binds Cmd+Shift+B on the ticket surface. It draws nothing.
export function BriefCopy({ ticket }: BriefCopyProps) {
	const copy = useCopyBrief(ticket);
	useHotkey("mod+shift+b", (event) => {
		event.preventDefault();
		void copy();
	});
	return null;
}
