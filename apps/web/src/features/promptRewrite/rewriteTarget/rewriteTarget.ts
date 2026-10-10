export type RewriteSelection = {
	element: HTMLElement;
	text: string;
	valid: () => boolean;
	replace: (text: string) => (() => boolean) | null;
	insertKey: () => void;
};

export type RewriteTarget = { capture: () => RewriteSelection | null; selectAll: () => boolean };

const targets = new WeakMap<HTMLElement, RewriteTarget>();

export function registerRewriteTarget(element: HTMLElement, target: RewriteTarget) {
	targets.set(element, target);
	return () => {
		if (targets.get(element) === target) targets.delete(element);
	};
}

export function registeredRewriteTarget(element: HTMLElement) {
	return targets.get(element);
}
