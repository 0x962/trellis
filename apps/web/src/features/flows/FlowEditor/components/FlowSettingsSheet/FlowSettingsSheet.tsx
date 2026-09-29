import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type Flow, FlowSlugSchema } from "@trellis/api";
import { Button, FailureState, Input, Sheet, SheetBody, SheetFooter, Textarea } from "@trellis/ui";
import { useEffect, useRef, useState } from "react";
import { useApp } from "../../../../../lib/appContext";
import { LaunchFields } from "../../../../agents/LaunchFields";
import { FlowProjectSelect } from "../../../FlowProjectSelect";
import { discoveryDocument } from "../../../FlowsPage/discoveryDocument";
import { discoveryPosition } from "../../../FlowsPage/discoveryPosition";
import { flowHarnessOf, harnessOfFlow, sameFlowHarness } from "../../../flowHarness";
import { projectRefOfSelectValue, selectValueOfProjectKey } from "../../../flowProject";
import { FlowSettingsFeedback } from "./components/FlowSettingsFeedback";
import { FlowVersionDetails } from "./components/FlowVersionDetails";
import { flowSettingsFailure } from "./flowSettingsFailure";
import type { FlowSettingsState } from "./flowSettingsState";

type FlowSettingsSheetProps = { flow: Flow; onSaved: (flow: Flow) => void; onClose: () => void };

export function FlowSettingsSheet({ flow: initialFlow, onSaved, onClose }: FlowSettingsSheetProps) {
	const { client, orpc, queryClient } = useApp();
	const navigate = useNavigate();
	const [flow, setFlow] = useState(initialFlow);
	const document = useQuery(orpc.flowDocumentsV1.get.queryOptions({ input: { flow: flow.id }, retry: false }));
	const [result, setResult] = useState<FlowSettingsState["result"]>({ state: "editing" });
	const [filters, setFilters] = useState<FlowSettingsState["filters"]>({ query: "", project: null });
	useEffect(() => setFilters(discoveryPosition.readFilters(sessionStorage)), []);
	const nameRef = useRef<HTMLInputElement>(null);
	const [name, setName] = useState(flow.name);
	const [slug, setSlug] = useState(flow.slug);
	const [description, setDescription] = useState(flow.description);
	const [briefing, setBriefing] = useState(flow.briefing);
	const [project, setProject] = useState(selectValueOfProjectKey(flow.project));
	const [harness, setHarness] = useState(harnessOfFlow(flow.harness));
	const [confirmDelete, setConfirmDelete] = useState(false);
	const parsedSlug = FlowSlugSchema.safeParse(slug);
	const slugValid = parsedSlug.success;
	const valid = name.trim() !== "" && slugValid;
	const dirty =
		project !== selectValueOfProjectKey(flow.project) ||
		name !== flow.name ||
		slug !== flow.slug ||
		description !== flow.description ||
		briefing !== flow.briefing ||
		!sameFlowHarness(flowHarnessOf(harness), flow.harness);
	const save = useMutation({
		mutationFn: () =>
			client.flows.update({
				flow: flow.id,
				project: projectRefOfSelectValue(project),
				name,
				slug,
				description,
				briefing,
				harness: flowHarnessOf(harness),
				expectedVersion: flow.version,
			}),
		onError: (error) => setResult(flowSettingsFailure(error)),
		onSuccess: async (saved) => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: orpc.flows.list.key() }),
				queryClient.invalidateQueries({ queryKey: orpc.flowDocumentsV1.get.key() }),
			]);
			onSaved(saved);
			onClose();
			if (saved.slug !== flow.slug)
				await navigate({ to: "/ai/flows/$slug", params: { slug: saved.slug }, replace: true });
		},
	});
	const remove = useMutation({
		mutationFn: () => client.flows.delete({ flow: flow.id }),
		onError: (error) => setResult(flowSettingsFailure(error)),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: orpc.flows.list.key() });
			await navigate({ to: "/ai/flows" });
		},
	});
	const reload = useMutation({
		mutationFn: () => client.flowDocumentsV1.get({ flow: flow.id }),
		onError: (error) => {
			const failure = flowSettingsFailure(error);
			if (failure.state === "deleted") setResult(failure);
		},
		onSuccess: (latest) => {
			setFlow(latest.flow);
			setName(latest.flow.name);
			setSlug(latest.flow.slug);
			setDescription(latest.flow.description);
			setBriefing(latest.flow.briefing);
			setProject(selectValueOfProjectKey(latest.flow.project));
			setHarness(harnessOfFlow(latest.flow.harness));
			setResult({ state: "editing" });
			queryClient.setQueryData(orpc.flowDocumentsV1.get.queryOptions({ input: { flow: flow.id } }).queryKey, latest);
		},
	});
	useEffect(() => {
		if (reload.isSuccess) nameRef.current?.focus();
	}, [reload.isSuccess]);
	const pending = save.isPending || remove.isPending || reload.isPending;
	const documentFailure = document.error ? flowSettingsFailure(document.error) : null;
	const feedback = documentFailure?.state === "deleted" ? documentFailure : result;
	const blocked = feedback.state === "conflict" || feedback.state === "deleted";
	const state: FlowSettingsState = {
		flow,
		filters,
		result: feedback,
		draft: {
			name,
			slug,
			description,
			briefing,
			project: projectRefOfSelectValue(project),
			harness: flowHarnessOf(harness),
		},
	};

	return (
		<Sheet
			open
			title="Flow settings"
			initialFocus={nameRef}
			titleClassName="text-md font-medium"
			onOpenChange={(open) => !open && !pending && onClose()}
		>
			<form
				className="flex min-h-full flex-col"
				onSubmit={(event) => {
					event.preventDefault();
					if (valid && dirty && !pending && !blocked) save.mutate();
				}}
			>
				<SheetBody>
					{document.data && <FlowVersionDetails entry={discoveryDocument(document.data)} />}
					{document.isPending && (
						<p role="status" className="text-sm text-fg-muted">
							Load saved version…
						</p>
					)}
					{document.isError && feedback.state !== "deleted" && (
						<FailureState title="Could not load the saved version" detail={document.error.message} />
					)}
					{reload.isError && feedback.state !== "deleted" && (
						<FailureState title="Could not reload the flow" detail={reload.error.message} />
					)}
					<FlowSettingsFeedback
						state={state}
						onReturn={() => onClose()}
						reloadAction={
							<Button type="button" disabled={pending} onClick={() => reload.mutate()}>
								Reload and discard edits
							</Button>
						}
					/>
					<FlowProjectSelect
						value={project}
						disabled={pending}
						hint="Trellis does not accept a pull request of this project until one flow of the project has a run."
						onChange={setProject}
					/>
					<Input
						ref={nameRef}
						label="Name"
						required
						autoComplete="off"
						disabled={pending}
						value={name}
						onChange={(event) => setName(event.target.value)}
					/>
					<div className="flex flex-col gap-2">
						<Input
							label="Slug"
							required
							autoComplete="off"
							disabled={pending}
							error={parsedSlug.success ? undefined : parsedSlug.error.issues[0]!.message}
							value={slug}
							onChange={(event) => setSlug(event.target.value)}
						/>
						<p className="text-xs text-fg-faint">The flow opens at /ai/flows/{slugValid ? slug : "…"}.</p>
					</div>
					<Input
						label="Description"
						autoComplete="off"
						disabled={pending}
						value={description}
						onChange={(event) => setDescription(event.target.value)}
					/>
					<Textarea
						label="Briefing"
						rows={12}
						disabled={pending}
						value={briefing}
						onChange={(event) => setBriefing(event.target.value)}
						placeholder="What every agent of this flow reads before its own instruction."
					/>
					<LaunchFields allowDefault="Claude" harness={harness} disabled={pending} onChange={setHarness} />
				</SheetBody>
				<SheetFooter
					confirmation={
						confirmDelete && (
							<fieldset
								className="flex flex-wrap items-center gap-2 border border-danger p-3"
								aria-label="Confirm deletion"
							>
								<p className="w-full break-words text-sm text-fg">Delete “{flow.name}”?</p>
								<p className="w-full text-sm text-fg-muted">
									This permanently deletes the flow with every step and connection.
								</p>
								<Button
									type="button"
									variant="danger"
									disabled={pending || feedback.state === "deleted"}
									onClick={() => remove.mutate()}
								>
									Confirm delete
								</Button>
								<Button type="button" variant="quiet" disabled={pending} onClick={() => setConfirmDelete(false)}>
									Keep flow
								</Button>
							</fieldset>
						)
					}
					leading={
						<Button
							type="button"
							variant="quiet"
							disabled={pending || confirmDelete || feedback.state === "deleted"}
							onClick={() => setConfirmDelete(true)}
						>
							Delete flow
						</Button>
					}
				>
					<Button type="button" variant="quiet" disabled={pending} onClick={onClose}>
						Cancel
					</Button>
					<Button
						type="submit"
						variant="primary"
						disabled={!valid || !dirty || pending || blocked || confirmDelete}
						aria-busy={save.isPending}
					>
						Save changes
					</Button>
				</SheetFooter>
			</form>
		</Sheet>
	);
}
