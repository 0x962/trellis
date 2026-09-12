import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type Flow, FlowSlugSchema } from "@trellis/api";
import { Button, Input, Sheet, SheetBody, SheetFooter, Textarea } from "@trellis/ui";
import { useRef, useState } from "react";
import { useApp } from "../../../../../lib/appContext";

type FlowSettingsSheetProps = { flow: Flow; onSaved: (flow: Flow) => void; onClose: () => void };

// The name, the slug, the description, and the briefing of a flow. Every
// agent of the flow reads the briefing before its own instruction.
export function FlowSettingsSheet({ flow, onSaved, onClose }: FlowSettingsSheetProps) {
	const { client, orpc, queryClient } = useApp();
	const navigate = useNavigate();
	const nameRef = useRef<HTMLInputElement>(null);
	const [name, setName] = useState(flow.name);
	const [slug, setSlug] = useState(flow.slug);
	const [description, setDescription] = useState(flow.description);
	const [briefing, setBriefing] = useState(flow.briefing);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const slugValid = FlowSlugSchema.safeParse(slug).success;
	const valid = name.trim() !== "" && slugValid;
	const dirty =
		name !== flow.name || slug !== flow.slug || description !== flow.description || briefing !== flow.briefing;
	const save = useMutation({
		mutationFn: () =>
			client.flows.update({ flow: flow.id, name, slug, description, briefing, expectedVersion: flow.version }),
		onSuccess: async (saved) => {
			onSaved(saved);
			onClose();
			if (saved.slug !== flow.slug)
				await navigate({ to: "/ai/flows/$slug", params: { slug: saved.slug }, replace: true });
		},
	});
	const remove = useMutation({
		mutationFn: () => client.flows.delete({ flow: flow.id }),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: orpc.flows.list.key() });
			await navigate({ to: "/ai/flows" });
		},
	});
	const pending = save.isPending || remove.isPending;

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
					if (valid && dirty && !pending) save.mutate();
				}}
			>
				<SheetBody>
					<Input
						ref={nameRef}
						label="Name"
						required
						autoComplete="off"
						maxLength={120}
						disabled={pending}
						value={name}
						onChange={(event) => setName(event.target.value)}
					/>
					<div className="flex flex-col gap-2">
						<Input
							label="Slug"
							required
							autoComplete="off"
							maxLength={64}
							disabled={pending}
							invalid={!slugValid}
							value={slug}
							onChange={(event) => setSlug(event.target.value)}
						/>
						<p className="text-xs text-fg-faint">The flow opens at /ai/flows/{slugValid ? slug : "…"}.</p>
					</div>
					<Input
						label="Description"
						autoComplete="off"
						maxLength={2000}
						disabled={pending}
						value={description}
						onChange={(event) => setDescription(event.target.value)}
					/>
					<Textarea
						label="Briefing"
						rows={12}
						maxLength={200000}
						disabled={pending}
						value={briefing}
						onChange={(event) => setBriefing(event.target.value)}
						placeholder="What every agent of this flow reads before its own instruction."
					/>
					{save.isError && (
						<p role="alert" className="text-sm text-danger">
							Could not save the flow. {save.error.message}
						</p>
					)}
					{remove.isError && (
						<p role="alert" className="text-sm text-danger">
							Could not delete the flow. {remove.error.message}
						</p>
					)}
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
								<Button type="button" variant="danger" disabled={pending} onClick={() => remove.mutate()}>
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
							disabled={pending || confirmDelete}
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
						disabled={!valid || !dirty || pending || confirmDelete}
						aria-busy={save.isPending}
					>
						Save changes
					</Button>
				</SheetFooter>
			</form>
		</Sheet>
	);
}
