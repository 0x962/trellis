import { useMutation, useQuery } from "@tanstack/react-query";
import type { AgentBroadcastInput, AgentBroadcastResult } from "@trellis/api";
import { BroadcastComposer, Button, Checkbox, FailureState, FieldHint, Textarea } from "@trellis/ui";
import { useEffect, useRef, useState } from "react";
import { useApp } from "../../../lib/appContext";
import { errorMessage } from "../../../lib/conflict";
import { pageSheetActions } from "../../../stores/pageSheetStore";
import type { BroadcastEpic } from "./broadcastStore";

type DeliveryInput = AgentBroadcastInput & {
	previewCount: number;
};

const agents = (count: number) => `${count} ${count === 1 ? "agent" : "agents"}`;

const recipientLabel = (failure: AgentBroadcastResult["failures"][number]) =>
	failure.recipient.ticketIdentifier
		? `${failure.recipient.name} (${failure.recipient.ticketIdentifier})`
		: failure.recipient.name;

export function BroadcastDialog({ epic, onClose }: { epic?: BroadcastEpic | null; onClose: () => void }) {
	const { client, orpc } = useApp();
	const message = useRef<HTMLTextAreaElement>(null);
	const resultStatus = useRef<HTMLDivElement>(null);
	const [working, setWorking] = useState(true);
	const [idle, setIdle] = useState(false);
	const [text, setText] = useState("");
	const request = useRef<DeliveryInput | null>(null);
	const scope = epic ? { epic: epic.ref } : {};
	const counts = useQuery({
		...orpc.agentRuns.broadcastRecipients.queryOptions({ input: scope }),
		refetchInterval: 2000,
	});
	const delivery = useMutation({
		mutationFn: ({ previewCount: _previewCount, ...input }: DeliveryInput) => client.agentRuns.broadcast(input),
	});
	const group = working ? (idle ? "both" : "working") : idle ? "idle" : null;
	const count = (working ? (counts.data?.working ?? 0) : 0) + (idle ? (counts.data?.idle ?? 0) : 0);
	const canSend = group !== null && counts.isSuccess && count > 0 && text.trim().length > 0 && !delivery.isPending;
	const result = delivery.data;
	const submitted = delivery.variables;
	const submit = () => {
		if (!canSend || result) return;
		const previous = request.current;
		const requestId =
			previous?.group === group && previous.text === text && previous.epic === scope.epic
				? previous.requestId
				: crypto.randomUUID();
		request.current = { ...scope, group, text, requestId, previewCount: count };
		delivery.mutate(request.current);
	};
	const close = () => {
		if (!delivery.isPending) onClose();
	};
	useEffect(() => {
		if (result) resultStatus.current?.focus();
	}, [result]);

	return (
		<BroadcastComposer
			title="Broadcast a message"
			scope={epic?.name ?? "All of Trellis"}
			busy={delivery.isPending}
			description={
				epic
					? `Send one message to the selected groups in ${epic.name}.`
					: "Send one normal message to each agent in the selected groups."
			}
			initialFocus={result ? undefined : message}
			onClose={close}
			onSubmit={submit}
			footer={
				result ? (
					<Button size="md" variant="primary" className="composer-create broadcast-composer-action" onClick={close}>
						Done
					</Button>
				) : (
					<>
						<Button type="button" size="md" onClick={close} disabled={delivery.isPending}>
							Cancel
						</Button>
						<Button
							type="submit"
							size="md"
							variant="primary"
							processing={delivery.isPending}
							disabled={!canSend}
							className="composer-create broadcast-composer-action"
						>
							{counts.isSuccess ? `Send to ${agents(count)}` : "Send"}
						</Button>
					</>
				)
			}
		>
			<div
				ref={resultStatus}
				role="status"
				aria-live="polite"
				tabIndex={result ? -1 : undefined}
				className={result ? "broadcast-composer-result" : "sr-only"}
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
							<ul className="flex flex-col gap-3">
								{result.failures.map((failure) => (
									<li key={failure.recipient.id}>
										<FailureState
											title={`The message did not reach ${recipientLabel(failure)}`}
											detail={failure.reason}
											variant="section"
											action={
												<Button
													size="md"
													onClick={() => {
														close();
														pageSheetActions.openSession(failure.recipient.id);
													}}
												>
													Open agent
												</Button>
											}
										/>
									</li>
								))}
							</ul>
						)}
					</>
				)}
			</div>
			{!result && (
				<>
					<fieldset disabled={delivery.isPending} className="broadcast-composer-fields">
						<Textarea
							ref={message}
							label="Message"
							hideLabel
							variant="composer"
							className="broadcast-composer-message"
							placeholder="Write a message for your agents..."
							rows={6}
							value={text}
							onChange={(event) => setText(event.target.value)}
						/>
						<fieldset className="broadcast-composer-recipients">
							<legend className="sr-only">Recipient groups</legend>
							<Checkbox
								label={counts.isSuccess ? `Working agents (${counts.data.working})` : "Working agents"}
								checked={working}
								onCheckedChange={setWorking}
								disabled={delivery.isPending}
								className="broadcast-composer-recipient"
							/>
							<Checkbox
								label={counts.isSuccess ? `Idle agents (${counts.data.idle})` : "Idle agents"}
								checked={idle}
								onCheckedChange={setIdle}
								disabled={delivery.isPending}
								className="broadcast-composer-recipient"
							/>
						</fieldset>
						<FieldHint className="broadcast-composer-hint" aria-live="polite">
							{counts.isPending
								? "Counting recipients."
								: group === null
									? "Select at least one group."
									: counts.isSuccess && count === 0
										? "No agents match the selected groups."
										: "Select one or both groups."}{" "}
							Idle agents have unfinished tickets.
						</FieldHint>
						{counts.isError && (
							<FailureState
								title="The recipient count did not load"
								detail={errorMessage(counts.error)}
								variant="section"
								recovery="retrying"
							/>
						)}
					</fieldset>
					{delivery.isError && (
						<FailureState
							title="The broadcast did not send"
							detail={errorMessage(delivery.error)}
							variant="section"
							action={
								<Button size="md" disabled={!canSend} onClick={submit}>
									Try again
								</Button>
							}
						/>
					)}
				</>
			)}
		</BroadcastComposer>
	);
}
