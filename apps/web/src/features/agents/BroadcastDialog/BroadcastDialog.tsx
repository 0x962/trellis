import { useMutation, useQuery } from "@tanstack/react-query";
import type { AgentBroadcastGroup, AgentBroadcastResult } from "@trellis/api";
import { Button, ChoiceGroup, Dialog, FailureState, Textarea } from "@trellis/ui";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { errorMessage } from "../../../lib/conflict";

type DeliveryInput = {
	group: AgentBroadcastGroup;
	text: string;
	requestId: string;
	previewCount: number;
};

const agents = (count: number) => `${count} ${count === 1 ? "agent" : "agents"}`;

const recipientLabel = (failure: AgentBroadcastResult["failures"][number]) =>
	failure.recipient.ticketIdentifier
		? `${failure.recipient.name} (${failure.recipient.ticketIdentifier})`
		: failure.recipient.name;

export function BroadcastDialog({ onClose }: { onClose: () => void }) {
	const { client, orpc } = useApp();
	const message = useRef<HTMLTextAreaElement>(null);
	const resultStatus = useRef<HTMLDivElement>(null);
	const [group, setGroup] = useState<AgentBroadcastGroup>("working");
	const [text, setText] = useState("");
	const [requestId] = useState(() => crypto.randomUUID());
	const counts = useQuery({
		...orpc.agentRuns.broadcastRecipients.queryOptions({ input: {} }),
		refetchInterval: 2000,
	});
	const delivery = useMutation({
		mutationFn: ({ previewCount: _previewCount, ...input }: DeliveryInput) => client.agentRuns.broadcast(input),
	});
	const count = counts.data?.[group] ?? 0;
	const canSend = counts.isSuccess && count > 0 && text.trim().length > 0 && !delivery.isPending;
	const result = delivery.data;
	const submitted = delivery.variables;
	const countDescription = (target: AgentBroadcastGroup) => {
		if (counts.isPending) return "Trellis is counting agents.";
		if (counts.isError) return "The count is not available.";
		return target === "working"
			? `${agents(counts.data.working)} have an active turn.`
			: `${agents(counts.data.idle)} can receive a new turn.`;
	};
	const options = [
		{
			value: "working" as const,
			label: "All working agents",
			description: countDescription("working"),
		},
		{
			value: "idle" as const,
			label: "All idle agents",
			description: countDescription("idle"),
		},
	];
	const submit = (event: FormEvent) => {
		event.preventDefault();
		if (!canSend) return;
		delivery.mutate({ group, text: text.trim(), requestId, previewCount: count });
	};
	const close = () => {
		if (!delivery.isPending) onClose();
	};
	useEffect(() => {
		if (result) resultStatus.current?.focus();
	}, [result]);

	return (
		<Dialog
			open
			title="Broadcast a message"
			description="Send one normal message to each agent in the selected group."
			initialFocus={result ? undefined : message}
			onOpenChange={(open) => !open && close()}
		>
			<div
				ref={resultStatus}
				role="status"
				aria-live="polite"
				tabIndex={result ? -1 : undefined}
				className={result ? "flex flex-col gap-2 outline-none" : "sr-only"}
			>
				{result && (
					<>
						<p className="text-sm text-fg">
							Trellis accepted {result.acceptedCount} of {result.recipientCount} deliveries.
						</p>
						<p className="text-xs text-fg-muted">
							This result does not confirm that an agent read or acknowledged the message.
						</p>
						{submitted && submitted.previewCount !== result.recipientCount && (
							<p className="text-xs text-fg-muted">
								The recipient group changed from {submitted.previewCount} to {result.recipientCount} before delivery.
							</p>
						)}
						{result.failures.length > 0 && (
							<div className="flex flex-col gap-1 rounded-md border border-danger-soft bg-danger-soft p-2.5">
								<p className="text-sm font-medium text-danger">These agents did not receive the message:</p>
								<ul className="flex list-disc flex-col gap-1 pl-4 text-xs text-fg-muted">
									{result.failures.map((failure) => (
										<li key={failure.recipient.id}>
											<span className="font-medium text-fg">{recipientLabel(failure)}</span>: {failure.reason}
										</li>
									))}
								</ul>
							</div>
						)}
					</>
				)}
			</div>
			{result ? (
				<div className="flex justify-end">
					<Button size="md" variant="primary" onClick={close}>
						Done
					</Button>
				</div>
			) : (
				<form className="flex flex-col gap-4" onSubmit={submit}>
					<fieldset disabled={delivery.isPending} className="flex flex-col gap-4">
						<ChoiceGroup label="Recipient group" options={options} value={group} onValueChange={setGroup} />
						{counts.isError && (
							<FailureState
								title="The recipient count did not load"
								detail={errorMessage(counts.error)}
								variant="section"
							/>
						)}
						<Textarea
							ref={message}
							label="Message"
							rows={6}
							maxLength={20000}
							value={text}
							onChange={(event) => setText(event.target.value)}
						/>
					</fieldset>
					{delivery.isError && (
						<FailureState title="The broadcast did not send" detail={errorMessage(delivery.error)} variant="section" />
					)}
					<div className="flex items-center justify-between gap-3">
						<p className="text-xs text-fg-muted tabular-nums" aria-live="polite">
							{counts.isPending ? "Counting recipients" : agents(count)}
						</p>
						<div className="flex gap-2">
							<Button type="button" size="md" onClick={close}>
								Cancel
							</Button>
							<Button type="submit" size="md" variant="primary" processing={delivery.isPending} disabled={!canSend}>
								Send
							</Button>
						</div>
					</div>
				</form>
			)}
		</Dialog>
	);
}
