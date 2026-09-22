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

test("the done mark draws larger than the shared icon box", () => {
	const html = renderToStaticMarkup(<StatusIcon category="done" label="Done" />);

	expect(html).toContain("size-4");
	expect(html).toContain("text-success");
});
