import { useMutation } from "@tanstack/react-query";
import type { TicketSummary } from "@trellis/api";
import { Button } from "@trellis/ui";
import { type FormEvent, type KeyboardEvent, useRef, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { ghErrorLine } from "../../../utils/ghErrorLine";

export type LinkPrFieldProps = {
	ticket: TicketSummary;
	// Escape turns the field back into the Link PR button.
	onClose: () => void;
	// The line that explains a refused URL or a gh failure, or null when the
	// field has no error. The section shows it under its header.
	onError: (message: string | null) => void;
};

// The field that links a PR URL to the ticket. It opens focused. Enter links
// the URL, then the field clears and keeps the focus for the next URL.
export function LinkPrField({ ticket, onClose, onError }: LinkPrFieldProps) {
	const { client, orpc, queryClient } = useApp();
	const [url, setUrl] = useState("");
	const field = useRef<HTMLInputElement>(null);
	const listKey = orpc.pullRequests.list.queryKey({ input: { ticket: ticket.id } });
	const link = useMutation({
		mutationFn: async (typed: string) => await client.pullRequests.link({ ticket: ticket.identifier, url: typed }),
		onSuccess: (linked) => {
			queryClient.setQueryData(listKey, (listed) => {
				const current = listed!;
				return current.some((pr) => pr.id === linked.id) ? current : [...current, linked];
			});
			setUrl("");
			onError(null);
			field.current!.focus();
		},
		onError: (error) => onError(ghErrorLine(error)),
	});

	const submit = (event: FormEvent) => {
		event.preventDefault();
		link.mutate(url.trim());
	};

	const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key !== "Escape") return;
		event.preventDefault();
		event.stopPropagation();
		onClose();
	};

	return (
		<form onSubmit={submit} className="flex items-center gap-2">
			<input
				ref={field}
				// biome-ignore lint/a11y/noAutofocus: the field opens from a click on Link PR, so it takes the focus
				autoFocus
				aria-label="Link PR"
				value={url}
				placeholder="github.com/owner/repo/pull/123"
				autoComplete="off"
				spellCheck={false}
				onChange={(event) => setUrl(event.target.value)}
				onKeyDown={onKeyDown}
				className="h-7 w-72 rounded-md border border-border bg-surface px-2 font-mono text-sm text-fg outline-none transition-colors duration-hover ease-out placeholder:font-sans placeholder:text-fg-faint focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent-soft"
			/>
			<Button type="submit" size="sm" disabled={url.trim() === "" || link.isPending}>
				Link
			</Button>
		</form>
	);
}
