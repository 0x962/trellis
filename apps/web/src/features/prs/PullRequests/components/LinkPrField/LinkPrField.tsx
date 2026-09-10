import { useMutation } from "@tanstack/react-query";
import type { TicketSummary } from "@trellis/api";
import { Button, Input } from "@trellis/ui";
import { type FormEvent, useRef, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { ghErrorLine } from "../../../utils/ghErrorLine";

export type LinkPrFieldProps = {
	ticket: TicketSummary;
};

// The field that links a pull request URL to the ticket. A refused URL and a
// gh failure both answer in the field.
export function LinkPrField({ ticket }: LinkPrFieldProps) {
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
			field.current!.focus();
		},
	});

	const submit = (event: FormEvent) => {
		event.preventDefault();
		link.mutate(url.trim());
	};

	return (
		<form onSubmit={submit} className="flex flex-col gap-1">
			<div className="flex items-center gap-2">
				<Input
					ref={field}
					label="Link PR"
					hideLabel
					value={url}
					placeholder="Paste a pull request URL"
					autoComplete="off"
					spellCheck={false}
					onChange={(event) => setUrl(event.target.value)}
					className="max-w-120"
				/>
				<Button type="submit" disabled={url.trim() === "" || link.isPending}>
					Link
				</Button>
			</div>
			{link.error !== null && (
				<span data-link-error="" role="alert" className="text-sm text-danger">
					{ghErrorLine(link.error)}
				</span>
			)}
		</form>
	);
}
