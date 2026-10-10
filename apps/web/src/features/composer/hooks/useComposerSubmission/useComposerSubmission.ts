import type { AgentRun, AgentRunStartInput, TicketCreateInput } from "@trellis/api";
import { useRef, useState } from "react";
import { type AssignChoice, harnessOf } from "../../../agents/AssignAgent/assignChoice";

export const submissionKey = "trellis-composer-submission";
export type ComposerReceipt = {
	identifier: string;
	assignment: { choice: AssignChoice; requestId: string; complete: boolean } | null;
};
type Phase = "idle" | "creating" | "uploading" | "assigning";

type Services<CreatedTicket> = {
	create: (input: TicketCreateInput) => Promise<CreatedTicket>;
	onCreated?: (ticket: CreatedTicket) => void;
	upload: (identifier: string) => Promise<boolean>;
	assign: (input: AgentRunStartInput) => Promise<AgentRun>;
	onAssigned: (run: AgentRun, choice: AssignChoice) => void;
};

export function useComposerSubmission<CreatedTicket extends { identifier: string }>(services: Services<CreatedTicket>) {
	const [receipt, setReceipt] = useState<ComposerReceipt | null>(() => {
		const stored = sessionStorage.getItem(submissionKey);
		return stored === null ? null : (JSON.parse(stored) as ComposerReceipt);
	});
	const current = useRef(receipt);
	const running = useRef(false);
	const [phase, setPhase] = useState<Phase>("idle");
	const [failure, setFailure] = useState<{ stage: Phase; detail: string } | null>(null);
	function save(next: ComposerReceipt | null) {
		current.current = next;
		setReceipt(next);
		if (next === null) sessionStorage.removeItem(submissionKey);
		else sessionStorage.setItem(submissionKey, JSON.stringify(next));
	}
	async function submit(input: TicketCreateInput, choice: AssignChoice | null) {
		if (running.current) return false;
		running.current = true;
		setFailure(null);
		let stage: Phase = "creating";
		try {
			let saved = current.current;
			if (saved === null) {
				setPhase(stage);
				const assignment = choice === null ? null : { choice, requestId: crypto.randomUUID(), complete: false };
				const ticket = await services.create(input);
				saved = { identifier: ticket.identifier, assignment };
				save(saved);
				services.onCreated?.(ticket);
			}
			stage = "uploading";
			setPhase(stage);
			if (!(await services.upload(saved.identifier))) {
				setFailure({ stage, detail: "Some files did not upload. Retry the attachments before the agent starts." });
				return false;
			}
			if (saved.assignment && !saved.assignment.complete) {
				stage = "assigning";
				setPhase(stage);
				const { choice: selected, requestId } = saved.assignment;
				const run = await services.assign({
					ticket: saved.identifier,
					harness: harnessOf(selected),
					...(selected.accountId === null ? {} : { accountId: selected.accountId }),
					requestId,
				});
				save({ ...saved, assignment: { ...saved.assignment, complete: true } });
				services.onAssigned(run, selected);
			}
			return true;
		} catch (error) {
			setFailure({ stage, detail: error instanceof Error ? error.message : String(error) });
			return false;
		} finally {
			running.current = false;
			setPhase("idle");
		}
	}
	return {
		receipt,
		phase,
		failure,
		submit,
		busy: phase !== "idle",
		isRunning: () => running.current,
		clear: () => {
			save(null);
			setFailure(null);
		},
	};
}
