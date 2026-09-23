import { type StatisticsLoop, shortDay } from "@trellis/api";
import { PrGlyph } from "@trellis/ui";
import { formatCount } from "../../../../../lib/format";
import { SourceMark } from "../SourceMark";
import { TicketCell } from "../TicketCell";
import { rounds } from "./loopWords";

const head = "px-2.5 py-1.5 text-left font-semibold text-fg-faint text-xs uppercase tracking-wide";
const cell = "border-border border-t px-2.5 py-2 text-sm text-fg";

export function LoopBlock({ loop }: { loop: StatisticsLoop }) {
	const threads = loop.threadsByPerson + loop.threadsByAgent;
	return (
		<>
			{loop.bill.length > 0 && (
				<div className="overflow-hidden rounded-lg border border-border bg-surface">
					<table className="w-full border-collapse">
						<thead>
							<tr>
								<th className={head} />
								<th className={head}>Ticket</th>
								<th className={`${head} w-full`}>Change</th>
								<th className={`${head} whitespace-nowrap text-right`}>Threads you wrote</th>
								<th className={`${head} max-md:hidden`}>Rounds</th>
								<th className={`${head} max-md:hidden`}>Merged</th>
							</tr>
						</thead>
						<tbody>
							{loop.bill.map((row) => (
								<tr key={row.prId}>
									<td className={`${cell} w-4 pr-0`}>
										<PrGlyph state="merged" isQueued={false} readyForReview size="sm" decorative />
									</td>
									<td className={`${cell} w-18`}>
										<TicketCell identifier={row.ticket} />
									</td>
									<td className={`${cell} w-full max-w-0 truncate`} title={row.title}>
										{row.title}
									</td>
									<td className={`${cell} text-right tabular`}>{formatCount(row.threadsByPerson)}</td>
									<td className={`${cell} whitespace-nowrap tabular max-md:hidden`}>{rounds(row.sentBack)}</td>
									<td className={`${cell} whitespace-nowrap text-fg-muted tabular max-md:hidden`}>
										{shortDay(row.mergedAt)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
			<dl className="mt-3 flex flex-col gap-2">
				<div className="flex items-baseline gap-2">
					<dt className="text-fg-muted text-sm">You wrote</dt>
					<dd className="flex items-baseline gap-2 text-fg text-sm tabular">
						{formatCount(loop.threadsByPerson)} of the {formatCount(threads)} review threads. The agents wrote{" "}
						{formatCount(loop.threadsByAgent)}.
						<SourceMark source="query" />
					</dd>
				</div>
				<div className="flex items-baseline gap-2">
					<dt className="text-fg-muted text-sm">You sent back</dt>
					<dd className="flex items-baseline gap-2 text-fg text-sm tabular">
						{formatCount(loop.sentBack)} of {formatCount(loop.merged)}.{" "}
						{formatCount(loop.merged - loop.withPersonVerdict)} merged with no verdict from you.
						<SourceMark source="query" />
					</dd>
				</div>
				<div className="flex items-baseline gap-2">
					<dt className="text-fg-muted text-sm">Ready to your verdict</dt>
					<dd className="flex items-baseline gap-2 text-fg-faint text-sm">
						Not recorded. Nothing stamps the moment a pull request becomes ready, so the page prints no wait.
						<SourceMark source="record" />
					</dd>
				</div>
			</dl>
		</>
	);
}
