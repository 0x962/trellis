import { Desktop, DeviceMobile, Moon, Sun } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import type { Layout, Scenario } from "../model";
import { IconButton, Segmented, Select, Tooltip, TrellisMark } from "../ui";
import { Preview } from "./components/Preview";

const search = new URLSearchParams(window.location.search);

export function Prototype() {
	const [layout, setLayout] = useState<Layout>(search.get("layout") === "split" ? "split" : "compact");
	const [theme, setTheme] = useState(search.get("theme") === "light" ? "light" : "dark");
	const [mobile, setMobile] = useState(false);
	const [scenario, setScenario] = useState<Scenario>((search.get("scenario") as Scenario) ?? "example");
	useEffect(() => {
		document.documentElement.dataset.theme = theme;
	}, [theme]);

	if (search.get("view") === "preview") return <Preview layout={layout} scenario={scenario} />;
	const params = new URLSearchParams({ view: "preview", layout, theme, scenario });
	return (
		<main className="prototype-gallery">
			<header className="gallery-header">
				<div className="gallery-identity">
					<TrellisMark className="size-7" />
					<div>
						<h1>Create ticket</h1>
						<p>Two local prototypes for Trellis</p>
					</div>
				</div>
				<div className="gallery-tools">
					<Select
						label="Preview state"
						items={[
							{ value: "example", label: "With content" },
							{ value: "empty", label: "Empty draft" },
							{ value: "failure", label: "Assignment error" },
						]}
						value={scenario}
						onValueChange={setScenario}
					/>
					<Tooltip content={mobile ? "Show desktop width" : "Show phone width"}>
						<IconButton
							label={mobile ? "Show desktop width" : "Show phone width"}
							icon={mobile ? <Desktop /> : <DeviceMobile />}
							pressed={mobile}
							onClick={() => setMobile(!mobile)}
						/>
					</Tooltip>
					<Tooltip content={theme === "dark" ? "Use light theme" : "Use dark theme"}>
						<IconButton
							label={theme === "dark" ? "Use light theme" : "Use dark theme"}
							icon={theme === "dark" ? <Sun /> : <Moon />}
							onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
						/>
					</Tooltip>
				</div>
			</header>
			<section className="gallery-intro" aria-label="Choose a design">
				<div>
					<h2>Write it. Assign it. Start.</h2>
					<p>Create the ticket and assign its agent with one action.</p>
				</div>
				<Segmented
					label="Design"
					options={[
						{ value: "compact", label: "A · Compact" },
						{ value: "split", label: "B · Side panel" },
					]}
					value={layout}
					onValueChange={setLayout}
				/>
			</section>
			<div className={`preview-frame ${mobile ? "is-mobile" : ""}`}>
				<div className="frame-caption">
					<span>{layout === "compact" ? "A / Compact composer" : "B / Agent side panel"}</span>
					<span>{mobile ? "390 px" : "Desktop"}</span>
				</div>
				<Preview key={params.toString()} layout={layout} scenario={scenario} embedded />
			</div>
			<footer className="gallery-footer">
				<p>
					<strong>
						{layout === "compact" ? "A keeps the focus on writing." : "B keeps assignment settings visible."}
					</strong>{" "}
					{layout === "compact"
						? "Open the model picker to adjust effort and account."
						: "The agent panel moves below the ticket on a phone."}
				</p>
				<p>Try the fields, pick an agent, then create. All actions stay in this preview.</p>
			</footer>
		</main>
	);
}
