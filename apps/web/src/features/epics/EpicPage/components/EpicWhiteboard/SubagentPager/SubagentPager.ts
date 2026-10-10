import type { AgentSubagentPage, AgentSubagentsInput } from "@trellis/api";
import { mergeSubagentObservations, type WhiteboardSubagent } from "../whiteboardSubagents";

type Runs = AgentSubagentsInput["runs"];
type Mode = "initial" | "more" | "tail";

export class SubagentPager {
	records: WhiteboardSubagent[] = [];
	partial = false;
	private ids: string[] = [];
	private pages = new Map<string, AgentSubagentPage>();
	private initial = false;
	private busy = false;
	private failed: Runs | null = null;
	private tailIndex = 0;
	constructor(readonly project: string) {}
	setIds(ids: string[]) {
		if (this.failed?.every((run) => !ids.includes(run.id))) this.failed = null;
		this.initial ||= ids.some((id) => !this.ids.includes(id) && !this.pages.has(id));
		this.ids = ids;
	}
	get more() {
		return this.ids.some((id) => !this.pages.has(id) || this.pages.get(id)!.hasMore);
	}
	get hasError() {
		return this.failed !== null;
	}
	take(mode: Mode): Runs {
		if (this.busy || (this.failed !== null && mode !== "more")) return [];
		let ids: string[];
		if (mode === "initial") {
			if (!this.initial) return [];
			this.initial = false;
			ids = this.ids.filter((id) => !this.pages.has(id));
		} else if (mode === "more" && this.failed !== null) {
			const retry = this.failed.filter((run) => this.ids.includes(run.id));
			this.busy = retry.length > 0;
			return retry;
		} else if (mode === "more" && this.more) {
			ids = this.ids.filter((id) => !this.pages.has(id) || this.pages.get(id)!.hasMore);
		} else {
			const tails = this.ids.filter((id) => this.pages.has(id) && !this.pages.get(id)!.hasMore);
			ids = [...tails.slice(this.tailIndex), ...tails.slice(0, this.tailIndex)];
			this.tailIndex = tails.length === 0 ? 0 : (this.tailIndex + 20) % tails.length;
		}
		const batch = ids.slice(0, 20).map((id) => {
			const after = this.pages.get(id)?.nextCursor;
			return after === null || after === undefined ? { id } : { id, after };
		});
		this.busy = batch.length > 0;
		return batch;
	}
	accept(pages: AgentSubagentPage[]) {
		for (const page of pages) this.pages.set(page.runId, page);
		this.records = mergeSubagentObservations(
			this.records,
			pages.flatMap((page) => page.observations),
		);
		this.partial ||= pages.some((page) => page.issues.length > 0);
		this.busy = false;
		this.failed = null;
	}
	reject(runs: Runs) {
		this.busy = false;
		this.failed = runs;
	}
}
