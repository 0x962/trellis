import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { StatusIcon } from "./StatusIcon";

test("review statuses can draw as human, agent, and queue marks", () => {
	const human = renderToStaticMarkup(
		<StatusIcon category="review" reviewer="human" color="warning" reviewShape="human" label="Human Review" />,
	);
	const agent = renderToStaticMarkup(
		<StatusIcon category="review" reviewer="agent" color="agent" reviewShape="agent" label="Agent Review" />,
	);
	const queue = renderToStaticMarkup(
		<StatusIcon category="review" reviewer="agent" color="fg" reviewShape="queue" label="Deploy Queue" />,
	);

	expect(human).toContain('data-review-shape="human"');
	expect(human).toContain("text-warning");
	expect(agent).toContain('data-review-shape="agent"');
	expect(agent).toContain("text-agent");
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
