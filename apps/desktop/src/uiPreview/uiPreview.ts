import { previewArgument } from "./previewArgument";

type PreviewOptions = {
	hostOrigin: () => string;
	reload: () => Promise<void>;
	changed: (active: boolean) => void;
};

export function createUiPreview(options: PreviewOptions) {
	let origin: string | undefined;
	let pending = Promise.resolve();
	const select = (next: string | null) => {
		const operation = pending.then(async () => {
			if (next !== null) {
				if (next === options.hostOrigin()) throw new Error("UI preview must use a separate server port.");
				const response = await fetch(`${next}/.trellis-preview`, {
					redirect: "error",
					signal: AbortSignal.timeout(5000),
				});
				if (!response.ok) throw new Error("The UI preview server does not respond.");
				const value: unknown = await response.json();
				if (
					typeof value !== "object" ||
					value === null ||
					!("hostOrigin" in value) ||
					value.hostOrigin !== options.hostOrigin()
				)
					throw new Error("The UI preview server must connect to this Trellis host.");
			}
			origin = next ?? undefined;
			options.changed(origin !== undefined);
			await options.reload();
		});
		// A failed network check releases the queue for the next explicit command.
		pending = operation.catch(() => {});
		return operation;
	};
	return {
		origin: () => origin,
		stop: () => select(null),
		apply: async (argv: string[]) => {
			const next = previewArgument(argv);
			if (next === undefined) return false;
			await select(next);
			return true;
		},
	};
}
