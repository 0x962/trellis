import { describe, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { expectClasses } from "../../../test/classes";
import { EntityCard } from "./EntityCard";

describe("EntityCard", () => {
	test("the tone colors the title", () => {
		render(<EntityCard title="Release Builder" description="Ships releases." tone="success" onEdit={() => {}} />);
		expectClasses(screen.getByRole("heading", { name: "Release Builder" }), "text-success");
	});
});
