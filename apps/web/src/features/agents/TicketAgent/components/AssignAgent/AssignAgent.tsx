import { ORPCError } from "@orpc/client";
import { CaretDown, Gear } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, FailureState, IconButton, Menu, type MenuItem, ProviderIcon, Tooltip } from "@trellis/ui";
import { useMemo, useRef, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { harnessLabel } from "../../../harnessPresets";
import { modelProviderOf } from "../../../modelProviderOf";
import {
	type AssignAccounts,
	type AssignChoice,
	DEFAULT_CHOICE,
	detailOf,
	harnessOf,
	keyOf,
	modelIdOf,
	modelNameOf,
	staleReasonOf,
	titleOf,
	withoutLostValues,
} from "./assignChoice";
import { completeAssignment } from "./completeAssignment";
import { AssignAgentDialog } from "./components/AssignAgentDialog";
import { rememberChoice, useRecentChoices } from "./recentChoices";

const MENU_LABEL = "Change the harness and the model";

const choiceIcon = (choice: AssignChoice) => {
	const provider = modelProviderOf(modelIdOf(choice));
	return provider === null ? undefined : <ProviderIcon provider={provider} decorative />;
};

// The message to show after a failed start. A rejected input carries its
// reason in the first issue. Every other error carries it in `message`.
const startFailure = (error: Error) =>
	error instanceof ORPCError && error.code === "INPUT_VALIDATION_FAILED"
		? (error.data as { issues: { message: string }[] }).issues[0]!.message
		: error.message;

// The Agent row of a ticket that holds no agent. The left half of the split
// control starts the newest stored choice, and the arrow opens the five
// stored choices and the dialog of every other choice.
export function AssignAgent({ ticket, disabled }: { ticket: string; disabled: boolean }) {
	const { client, orpc, queryClient } = useApp();
	const assignButton = useRef<HTMLButtonElement>(null);
	const menuButton = useRef<HTMLButtonElement>(null);
	const recent = useRecentChoices((store) => store.recent);
	const accountList = useQuery(orpc.harnessAccounts.list.queryOptions({ input: {} }));
	const accounts: AssignAccounts = accountList.data;
	// The choice the dialog stands on, and the half of the split control that
	// takes the focus back when it closes.
	const [dialog, setDialog] = useState<{ choice: AssignChoice; from: "assign" | "menu" } | null>(null);
	// One intent keeps one request ID, so Try again after a failure starts no
	// second agent. A different choice is a different intent.
	const [lastStart, setLastStart] = useState<{ choice: AssignChoice; requestId: string } | null>(null);
	const start = useMutation({
		mutationFn: ({ choice, requestId }: { choice: AssignChoice; requestId: string }) =>
			client.agentRuns.start({
				ticket,
				harness: harnessOf(choice),
				...(choice.accountId === null ? {} : { accountId: choice.accountId }),
				requestId,
			}),
		onSuccess: (run, { choice }) => {
			completeAssignment({
				queryClient,
				queryKeys: [
					orpc.agentRuns.list.queryOptions({ input: { ticket } }).queryKey,
					orpc.agentRuns.list.queryOptions({ input: { ticket, assigned: true } }).queryKey,
					orpc.agentRuns.list.queryOptions({ input: { assigned: true } }).queryKey,
				],
				run,
				rememberChoice: () => rememberChoice(choice),
				clearStart: () => setLastStart(null),
				invalidateRuns: () => void queryClient.invalidateQueries({ queryKey: orpc.agentRuns.list.key() }),
			});
		},
	});
	// A ticket that completed takes no agent. The ticket can complete while
	// this menu or this dialog stands open, so every path through this
	// function answers the current value of `disabled`, not the value it had
	// when the surface opened.
	const assign = (choice: AssignChoice) => {
		if (disabled) return;
		const requestId =
			lastStart !== null && keyOf(lastStart.choice) === keyOf(choice) ? lastStart.requestId : crypto.randomUUID();
		setLastStart({ choice, requestId });
		start.mutate({ choice, requestId });
	};
	const assignOrEdit = (choice: AssignChoice, from: "assign" | "menu") => {
		if (disabled) return;
		if (staleReasonOf(choice, accounts) === null) assign(choice);
		else setDialog({ choice: withoutLostValues(choice, accounts), from });
	};
	// The menu reads the model catalog once per row, and this row draws again
	// every two seconds while the ticket polls its agent runs. The rows change
	// only with the store and the account list, so they are built here and the
	// map below adds the handler, which holds this draw's values.
	const { current, rows, staleCurrent, currentTitle } = useMemo(() => {
		const current = recent[0] ?? DEFAULT_CHOICE;
		const choices = recent.length > 0 ? recent : [DEFAULT_CHOICE];
		return {
			current,
			staleCurrent: staleReasonOf(current, accounts),
			currentTitle: titleOf(current, accounts),
			rows: choices.map((choice, index) => {
				const stale = staleReasonOf(choice, accounts);
				return {
					choice,
					id: keyOf(choice),
					label: `${harnessLabel(choice.preset)} · ${modelNameOf(choice)}`,
					detail: stale ?? detailOf(choice, accounts),
					detailTone: (stale === null ? "muted" : "warning") as MenuItem["detailTone"],
					icon: choiceIcon(choice),
					kbd: String(index + 1),
				};
			}),
		};
	}, [recent, accounts]);
	const items: readonly MenuItem[] = rows.map(({ choice, ...row }) => ({
		...row,
		onSelect: () => assignOrEdit(choice, "menu"),
	}));
	const pendingStart = start.isPending ? lastStart : null;
	const failure =
		start.isError && lastStart !== null ? { choice: lastStart.choice, message: startFailure(start.error) } : null;
	return (
		<>
			<div className="flex items-center justify-between gap-2 py-1">
				<h3 className="text-xs font-medium text-fg-faint">Agent</h3>
				<span className="inline-flex items-center">
					<Tooltip content={staleCurrent ?? currentTitle}>
						<Button
							ref={assignButton}
							variant="primary"
							className="min-w-30 rounded-r-none focus-visible:z-1"
							disabled={disabled}
							processing={start.isPending}
							onClick={() => assignOrEdit(current, "assign")}
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
										onSelect: () => setDialog({ choice: withoutLostValues(current, accounts), from: "menu" }),
									},
								],
							},
						]}
						className="w-80"
						trigger={
							<IconButton
								ref={menuButton}
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
			{pendingStart !== null ? (
				<p role="status" className="min-h-5.5 text-xs text-fg-muted">
					{`Start ${titleOf(pendingStart.choice, accounts)}…`}
				</p>
			) : failure !== null ? (
				<FailureState
					variant="inline"
					className="min-h-5.5"
					title={failure.message}
					action={
						<Button variant="quiet" className="-ml-2.5" disabled={disabled} onClick={() => assign(failure.choice)}>
							Try again
						</Button>
					}
				/>
			) : (
				<p className="min-h-5.5 text-xs text-fg-muted">{recent.length > 0 ? "" : "No choice was stored yet."}</p>
			)}
			{dialog !== null && (
				<AssignAgentDialog
					initial={dialog.choice}
					accounts={accounts}
					disabled={disabled}
					finalFocus={dialog.from === "assign" ? assignButton : menuButton}
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
