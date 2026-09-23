import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusIcon } from "./StatusIcon";

test("review statuses can draw as dashed ring and queue marks", () => {
	const ring = renderToStaticMarkup(
		<StatusIcon category="review" color="warning" reviewShape="human" label="Human Review" />,
	);
	const queue = renderToStaticMarkup(
		<StatusIcon category="review" color="fg" reviewShape="queue" label="Deploy Queue" />,
	);

	expect(ring).toContain('data-review-shape="human"');
	expect(ring).toContain("text-warning");
	expect(queue).toContain('data-review-shape="queue"');
	expect(queue).toContain("text-fg");
});

test("the status marks draw in the shared 16 px icon box", () => {
	const todo = renderToStaticMarkup(<StatusIcon category="todo" label="Todo" />);
	const started = renderToStaticMarkup(<StatusIcon category="started" label="In Progress" />);
	const done = renderToStaticMarkup(<StatusIcon category="done" label="Done" />);

	expect(todo).toContain("size-4");
	expect(started).toContain("size-4");
	expect(done).toContain("size-4");
	expect(done).toContain("text-success");
});
