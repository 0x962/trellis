import { z } from "zod";
import { StatisticsSchema } from "../schemas/statistics.ts";
import { base } from "./base.ts";

export const statistics = {
	get: base
		.route({ method: "POST", path: "/statistics/get", summary: "Read the system statistics" })
		.input(z.object({}))
		.output(StatisticsSchema),
};
