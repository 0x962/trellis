import { useMutation } from "@tanstack/react-query";
import type { TicketSummary } from "@trellis/api";
import { Button } from "@trellis/ui";
import { type FormEvent, useRef, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { ghErrorLine } from "../../../utils/ghErrorLine";

export type LinkPrFieldProps = {
	ticket: TicketSummary;
	// The line that explains a refused URL or a gh failure, or null when the
	// field has no error. The modal shows it under the field.
	onError: (message: string | null) => void;
};

// The field that links a PR URL to the ticket. It opens focused. Enter links
// the URL, then the field clears and keeps the focus for the next URL.
export function LinkPrField({ ticket, onError }: LinkPrFieldProps) {
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

	return (
		<form onSubmit={submit} className="flex flex-col gap-3">
			<input
				ref={field}
				// biome-ignore lint/a11y/noAutofocus: the field is the first control of the modal, so it takes the focus
				autoFocus
				aria-label="Link PR"
				value={url}
				placeholder="github.com/owner/repo/pull/123"
				autoComplete="off"
				spellCheck={false}
				onChange={(event) => setUrl(event.target.value)}
				className="h-9 w-full rounded-md border border-border bg-surface px-2 font-mono text-sm text-fg outline-none transition-colors duration-hover ease-out placeholder:font-sans placeholder:text-fg-faint focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent-soft"
			/>
			<Button type="submit" className="self-end" disabled={url.trim() === "" || link.isPending}>
				Link
			</Button>
		</form>
	);
}
