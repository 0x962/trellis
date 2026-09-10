import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@trellis/ui";
import { marginOrigin, marginUrl } from "../../../../../../../utils/marginUrl";

export type MarginFrameProps = {
	// The pull request address on GitHub.
	url: string;
	// The pull request in the words the sheet header shows: `owner/repo #7`.
	label: string;
};

// margin serves another origin, so this page reads nothing of margin's
// reply, not even its status. It reads one fact: a request to an address
// that nothing listens on rejects. `no-cors` stops the browser from asking
// margin for a permission header that margin does not send. The request
// names margin's own page and never the pull request page, which would make
// margin call GitHub for a review nobody opened.
const marginAnswers = async () => {
	await fetch(marginOrigin, { mode: "no-cors", cache: "no-store" });
	return true;
};

// The margin page for one pull request, framed inside trellis. margin holds
// the diff, the checks, and the local review comments, so trellis draws no
// diff of its own.
//
// margin runs as a service on this machine and it can be down. A frame of an
// address that nothing answers shows the error page of the browser, which
// names neither margin nor the address. So the question goes to margin
// before the frame mounts, and a person who gets no page gets the address
// instead.
//
// The answer lives in the query cache for as long as the frame stays
// mounted. `gcTime: 0` drops it with the frame, so the next open asks margin
// again and a margin that started in between serves the page.
export function MarginFrame({ url, label }: MarginFrameProps) {
	const page = marginUrl(url);
	const answers = useQuery({
		queryKey: ["margin", "answers"],
		queryFn: marginAnswers,
		retry: false,
		staleTime: 0,
		gcTime: 0,
	});

	if (answers.isPending)
		return (
			<div data-margin-pending="" className="flex h-full items-center justify-center p-4">
				<Skeleton width="w-64" />
			</div>
		);

	if (answers.isError)
		return (
			<div
				data-margin-down=""
				role="alert"
				className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center"
			>
				<p className="text-sm text-fg">margin does not answer.</p>
				<p className="text-sm text-fg-muted">Start margin. The review waits at this address.</p>
				<a
					href={page}
					target="_blank"
					rel="noopener noreferrer"
					className="max-w-full break-all font-mono text-sm text-accent underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2"
				>
					{page}
				</a>
			</div>
		);

	return <iframe title={`${label} in margin`} src={page} className="block h-full w-full border-0 bg-bg" />;
}
