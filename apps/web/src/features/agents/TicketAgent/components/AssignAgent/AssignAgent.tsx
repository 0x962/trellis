import { ORPCError } from "@orpc/client";
import { CaretDown, Gear, WarningCircle } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { MODEL_CATALOG } from "@trellis/api";
import { Button, IconButton, Menu, type MenuItem, ProviderIcon, Tooltip } from "@trellis/ui";
import { useRef, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import {
	type AssignAccounts,
	type AssignChoice,
	choiceDetail,
	choiceKey,
	choiceTitle,
	DEFAULT_CHOICE,
	draftFrom,
	harnessOf,
	modelIdOf,
	staleReasonOf,
} from "../../../assignChoice";
import { assignChoiceActions, useAssignChoices } from "../../../assignChoices";
import { harnessLabel } from "../../../harnessPresets";
import { modelProviderOf } from "../../../modelProviderOf";
import { AssignAgentDialog } from "./components/AssignAgentDialog";

const MENU_LABEL = "Change the harness and the model";

const modelNameOf = (choice: AssignChoice) => {
	const id = modelIdOf(choice);
	return MODEL_CATALOG.find((model) => model.id === id)?.name ?? id;
};

const choiceMark = (choice: AssignChoice) => {
	const provider = modelProviderOf(modelIdOf(choice));
	return provider === null ? undefined : <ProviderIcon provider={provider} decorative />;
};

// The words the server refused, where it refused the input, and its message
// otherwise.
const startFailure = (error: Error) =>
	error instanceof ORPCError && error.code === "INPUT_VALIDATION_FAILED"
		? (error.data as { issues: { message: string }[] }).issues[0]!.message
		: error.message;

// The Agent row of a ticket that holds no agent. The left half of the split
// control starts the newest stored choice, and the arrow opens the five
// stored choices and the dialog of every other choice.
export function AssignAgent({ ticket, disabled }: { ticket: string; disabled: boolean }) {
	const { client, orpc, queryClient } = useApp();
	const navigate = useNavigate();
	const main = useRef<HTMLButtonElement>(null);
	const arrow = useRef<HTMLButtonElement>(null);
	const recent = useAssignChoices((store) => store.recent);
	const accountList = useQuery(orpc.harnessAccounts.list.queryOptions({ input: {} }));
	const accounts: AssignAccounts = accountList.data;
	// The choice the dialog stands on, and the half of the split control that
	// takes the focus back when it closes.
	const [dialog, setDialog] = useState<{ choice: AssignChoice; from: "main" | "menu" } | null>(null);
	// The choice of the last start and its request ID. One intent keeps one
	// request ID, so Try again after a failure starts no second agent. A
	// different choice is a different intent.
	const [intent, setIntent] = useState<{ choice: AssignChoice; requestId: string } | null>(null);
	const start = useMutation({
		mutationFn: ({ choice, requestId }: { choice: AssignChoice; requestId: string }) =>
			client.agentRuns.start({
				ticket,
				harness: harnessOf(choice),
				...(choice.accountId === null ? {} : { accountId: choice.accountId }),
				requestId,
			}),
		onSuccess: (run, { choice }) => {
			assignChoiceActions.remember(choice);
			setIntent(null);
			queryClient.setQueryData(orpc.agentRuns.list.queryOptions({ input: { ticket } }).queryKey, (current) => [
				run,
				...(current ?? []).filter((item) => item.id !== run.id),
			]);
			void queryClient.invalidateQueries({ queryKey: orpc.agentRuns.list.key() });
			void navigate({ to: "/t/$identifier", params: { identifier: ticket }, hash: `attempt-${run.terminalId}` });
		},
	});
	// A ticket that completed takes no agent. The ticket can complete while
	// this menu or this dialog stands open, so every path through this
	// function answers the current value of `disabled`, not the value it had
	// when the surface opened.
	const assign = (choice: AssignChoice) => {
		if (disabled) return;
		const requestId =
			intent !== null && choiceKey(intent.choice) === choiceKey(choice) ? intent.requestId : crypto.randomUUID();
		setIntent({ choice, requestId });
		start.mutate({ choice, requestId });
	};
	// A choice the machine can no longer run opens the dialog with the values
	// it lost dropped. The person picks again and presses Assign.
	const take = (choice: AssignChoice, from: "main" | "menu") => {
		if (disabled) return;
		if (staleReasonOf(choice, accounts) === null) assign(choice);
		else setDialog({ choice: draftFrom(choice, accounts), from });
	};
	const current = recent[0] ?? DEFAULT_CHOICE;
	const rows: readonly AssignChoice[] = recent.length > 0 ? recent : [DEFAULT_CHOICE];
	const items: readonly MenuItem[] = rows.map((choice, index) => {
		const stale = staleReasonOf(choice, accounts);
		return {
			id: choiceKey(choice),
			label: `${harnessLabel(choice.preset)} · ${modelNameOf(choice)}`,
			detail: stale ?? choiceDetail(choice, accounts),
			detailTone: stale === null ? "muted" : "warning",
			icon: choiceMark(choice),
			kbd: String(index + 1),
			onSelect: () => take(choice, "menu"),
		};
	});
	const busy = start.isPending ? intent : null;
	const failure = start.isError && intent !== null ? { choice: intent.choice, words: startFailure(start.error) } : null;
	const staleCurrent = staleReasonOf(current, accounts);
	return (
		<>
			<div className="flex items-center justify-between gap-2 py-1">
				<h3 className="text-xs font-medium text-fg-faint">Agent</h3>
				<span className="inline-flex items-center">
					<Tooltip content={staleCurrent ?? choiceTitle(current, accounts)}>
						<Button
							ref={main}
							variant="primary"
							className="min-w-30 rounded-r-none focus-visible:z-1"
							disabled={disabled}
							processing={start.isPending}
							onClick={() => take(current, "main")}
						>
							{`Assign ${harnessLabel(current.preset)}`}
						</Button>
					</Tooltip>
					<Menu
						label={MENU_LABEL}
						triggerTooltip={MENU_LABEL}
						items={[
							{ type: "group", label: recent.length > 0 ? "Recent" : "Default", items },
							{
								type: "group",
								items: [
									{
										label: "Set something else…",
										icon: <Gear />,
										onSelect: () => setDialog({ choice: draftFrom(current, accounts), from: "menu" }),
									},
								],
							},
						]}
						className="w-80"
						trigger={
							<IconButton
								ref={arrow}
								label={MENU_LABEL}
								icon={<CaretDown />}
								variant="primary"
								disabled={disabled || start.isPending}
								className="-ml-px rounded-l-none focus-visible:z-1"
							/>
						}
					/>
				</span>
			</div>
			{busy !== null ? (
				<p role="status" className="min-h-5.5 text-xs text-fg-muted">
					{`Start ${choiceTitle(busy.choice, accounts)}…`}
				</p>
			) : failure !== null ? (
				<div role="alert" className="flex min-h-5.5 flex-col items-start gap-1 text-xs text-danger">
					<span className="flex items-start gap-2">
						<WarningCircle aria-hidden="true" className="mt-px size-3.5 shrink-0" />
						<span>{failure.words}</span>
					</span>
					<Button variant="quiet" className="-ml-2.5" disabled={disabled} onClick={() => assign(failure.choice)}>
						Try again
					</Button>
				</div>
			) : (
				<p className="min-h-5.5 text-xs text-fg-muted">{recent.length > 0 ? "" : "No choice was stored yet."}</p>
			)}
			{dialog !== null && (
				<AssignAgentDialog
					initial={dialog.choice}
					accounts={accounts}
					disabled={disabled}
					finalFocus={dialog.from === "main" ? main : arrow}
					onAssign={(choice) => {
						setDialog(null);
						assign(choice);
					}}
					onClose={() => setDialog(null)}
				/>
			)}
		</>
	);
}
