import { useMutation } from "@tanstack/react-query";
import { type Role, type RoleCreateInput, RoleCreateInputSchema } from "@trellis/api";
import { Button, ConfirmDialog, FailureState, Input, Sheet, SheetBody, SheetFooter, Skeleton } from "@trellis/ui";
import { lazy, Suspense, useRef, useState } from "react";
import { useApp } from "../../../../../lib/appContext";

const MarkdownEditor = lazy(() =>
	import("../../../../../components/MarkdownEditor").then((module) => ({ default: module.MarkdownEditor })),
);

export function RoleSheet({ role, onClose }: { role?: Role; onClose: () => void }) {
	const { client, orpc, queryClient } = useApp();
	const nameRef = useRef<HTMLInputElement>(null);
	const [name, setName] = useState(role?.name ?? "");
	const [body, setBody] = useState(role?.body ?? "");
	const [showErrors, setShowErrors] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState(false);
	const input = RoleCreateInputSchema.safeParse({ name, body });
	const saved = async () => {
		await queryClient.invalidateQueries({ queryKey: orpc.roles.key() });
		onClose();
	};
	const save = useMutation({
		mutationFn: (fields: RoleCreateInput) =>
			role === undefined ? client.roles.create(fields) : client.roles.update({ id: role.id, ...fields }),
		onSuccess: saved,
	});
	const remove = useMutation({ mutationFn: () => client.roles.delete({ id: role!.id }), onSuccess: saved });
	const pending = save.isPending || remove.isPending;
	return (
		<>
			<Sheet
				open
				title={role === undefined ? "New role" : "Edit role"}
				initialFocus={nameRef}
				titleClassName="text-md font-medium"
				onOpenChange={(open) => !open && !pending && !confirmDelete && onClose()}
			>
				<form
					className="flex min-h-full flex-col"
					noValidate
					onSubmit={(event) => {
						event.preventDefault();
						setShowErrors(true);
						if (!input.success) {
							nameRef.current?.focus();
							return;
						}
						if (!pending && !confirmDelete) save.mutate(input.data);
					}}
				>
					<SheetBody>
						<Input
							ref={nameRef}
							label="Name"
							required
							autoComplete="off"
							value={name}
							disabled={pending}
							error={showErrors && !input.success ? input.error.issues[0]?.message : undefined}
							onChange={(event) => setName(event.target.value)}
						/>
						<section aria-label="Body" className="flex flex-col gap-2">
							<h2 className="text-sm font-medium text-fg">Body</h2>
							<Suspense fallback={<Skeleton lines={3} />}>
								<MarkdownEditor markdown={body} onChange={setBody} autofocus={false} label="Body" disabled={pending} />
							</Suspense>
						</section>
						{save.isError && <FailureState title="Could not save the role" detail={save.error.message} />}
					</SheetBody>
					<SheetFooter
						leading={
							role !== undefined && (
								<Button type="button" variant="quiet" disabled={pending} onClick={() => setConfirmDelete(true)}>
									Delete role
								</Button>
							)
						}
					>
						<Button type="button" variant="quiet" disabled={pending} onClick={onClose}>
							Cancel
						</Button>
						<Button
							type="submit"
							variant="primary"
							disabled={pending || confirmDelete || (role !== undefined && name === role.name && body === role.body)}
							processing={save.isPending}
						>
							{role === undefined ? "Create role" : "Save changes"}
						</Button>
					</SheetFooter>
				</form>
			</Sheet>
			{confirmDelete && (
				<ConfirmDialog
					open
					modal={false}
					title="Delete role?"
					description={`Delete “${role!.name}” and its body?`}
					confirmLabel="Delete role"
					danger
					processing={remove.isPending}
					onConfirm={() => remove.mutate()}
					onCancel={() => !remove.isPending && setConfirmDelete(false)}
				>
					{remove.isError && <FailureState title="Could not delete the role" detail={remove.error.message} />}
				</ConfirmDialog>
			)}
		</>
	);
}
