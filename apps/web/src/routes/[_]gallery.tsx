import { createFileRoute } from "@tanstack/react-router";
import { Gallery } from "@trellis/ui/gallery";

// Every primitive in both themes, for the design reviewer. The root shell
// stays out of the frame.
export const Route = createFileRoute("/_gallery")({
	component: Gallery,
});
