import { toast } from "@trellis/ui";
import { useEffect } from "react";
import { useApp } from "../../../lib/appContext";
import { errorMessage } from "../../../lib/conflict";
import { installRewriteShortcut } from "../rewriteShortcut";
import type { RewriteSelection } from "../rewriteTarget";

export function RewriteHotkey() {
	const { client } = useApp();
	useEffect(() => {
		let active: AbortController | null = null;
		const rewrite = async (selection: RewriteSelection) => {
			if (active) return;
			const controller = new AbortController();
			active = controller;
			let changed = false;
			const invalidate = () => {
				changed = true;
			};
			selection.element.addEventListener("input", invalidate);
			selection.element.addEventListener("focusout", invalidate);
			const id = toast("Rewrite in progress…", { duration: Number.POSITIVE_INFINITY });
			try {
				const result = await client.promptRewrite.rewrite({ text: selection.text }, { signal: controller.signal });
				if (controller.signal.aborted) return;
				if (changed || !selection.valid()) {
					toast("The field changed. The rewrite was not applied.");
					return;
				}
				const undo = selection.replace(result.text);
				if (!undo) {
					toast.error("The editor could not apply the rewrite.");
					return;
				}
				toast.success("Prompt rewritten", {
					action: {
						label: "Undo",
						onClick: () => {
							if (!undo()) toast("The field changed. Use the editor Undo command.");
						},
					},
				});
			} catch (error) {
				if (!controller.signal.aborted)
					toast.error("The prompt could not be rewritten.", { description: errorMessage(error) });
			} finally {
				toast.dismiss(id);
				selection.element.removeEventListener("input", invalidate);
				selection.element.removeEventListener("focusout", invalidate);
				active = null;
			}
		};
		const remove = installRewriteShortcut(document, (selection) => {
			void rewrite(selection);
		});
		return () => {
			remove();
			active?.abort();
		};
	}, [client]);
	return null;
}
