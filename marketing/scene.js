import { motionPreference, panelAnimations } from "./motionPreference.js";

const canvas = document.querySelector("#structure");
const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const camera = new THREE.OrthographicCamera(-5, 5, 4, -4, 0.1, 100);
camera.position.set(9, 10, 12);
camera.lookAt(0, 0, 0);
scene.add(new THREE.AmbientLight(0xffffff, 2.4));
const light = new THREE.DirectionalLight(0xffffff, 3);
light.position.set(-3, 8, 5);
scene.add(light);
const group = new THREE.Group();
scene.add(group);
const accent = new THREE.MeshStandardMaterial({ color: 0x65b59c, roughness: 0.48, metalness: 0.12 });
const sage = new THREE.MeshStandardMaterial({ color: 0xcadbd4, roughness: 0.6 });
const cream = new THREE.MeshStandardMaterial({ color: 0xfafaf8, roughness: 0.5 });
const rail = new THREE.LineBasicMaterial({ color: 0x969692, transparent: true, opacity: 0.7 });
const points = [
	new THREE.Vector3(-2.2, 0, 0),
	new THREE.Vector3(0, 0, -2),
	new THREE.Vector3(0, 0, 0),
	new THREE.Vector3(0, 0, 2),
	new THREE.Vector3(2.3, 0, -1),
	new THREE.Vector3(2.3, 0, 1),
];
const edges = [
	[0, 1],
	[0, 2],
	[0, 3],
	[1, 4],
	[2, 4],
	[2, 5],
	[3, 5],
];
const tileGroups = [];
const boxGeometry = new THREE.BoxGeometry(1.08, 0.18, 0.84);
points.forEach((point, index) => {
	const tileGroup = new THREE.Group();
	group.add(tileGroup);
	tileGroups.push(tileGroup);
	tileGroup.userData.nodeIndex = index;
	const tile = new THREE.Mesh(boxGeometry, index === 0 ? accent : index > 3 ? sage : cream);
	tile.position.copy(point);
	tileGroup.add(tile);
	const frame = new THREE.LineSegments(
		new THREE.EdgesGeometry(boxGeometry),
		new THREE.LineBasicMaterial({ color: index === 0 ? 0x317968 : 0x8a8a86, transparent: true, opacity: 0.7 }),
	);
	frame.position.copy(point);
	tileGroup.add(frame);
	const labelCanvas = document.createElement("canvas");
	labelCanvas.width = 432;
	labelCanvas.height = 336;
	const ctx = labelCanvas.getContext("2d");
	ctx.fillStyle = "#fafaf5";
	ctx.fillRect(0, 0, 432, 336);
	ctx.fillStyle = index === 0 ? "#a7d9c6" : "#e6eee8";
	ctx.fillRect(0, 0, 432, 75);
	ctx.fillStyle = "#383831";
	ctx.font = "36px monospace";
	ctx.fillText(["Project", "Session A", "Session B", "Session C", "Diff #42", "Review"][index], 25, 52);
	ctx.fillStyle = "#77776d";
	ctx.font = "25px monospace";
	ctx.fillText(["Account", "Endpoint", "Email form", "Verify", "+18 / -4", "1 finding"][index], 25, 155);
	ctx.strokeStyle = "#ccccbe";
	ctx.lineWidth = 3;
	ctx.beginPath();
	ctx.moveTo(25, 196);
	ctx.lineTo(380, 196);
	ctx.moveTo(25, 223);
	ctx.lineTo(300, 223);
	ctx.stroke();
	const texture = new THREE.CanvasTexture(labelCanvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	const label = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 0.82), new THREE.MeshBasicMaterial({ map: texture }));
	label.rotation.x = -Math.PI / 2;
	label.position.copy(point);
	label.position.y = 0.101;
	tileGroup.add(label);
});
edges.forEach(([from, to]) => {
	const a = points[from],
		b = points[to];
	const geometry = new THREE.BufferGeometry().setFromPoints([
		a,
		new THREE.Vector3((a.x + b.x) / 2, 0, a.z),
		new THREE.Vector3((a.x + b.x) / 2, 0, b.z),
		b,
	]);
	group.add(new THREE.Line(geometry, rail));
});
const signalGeometry = new THREE.SphereGeometry(0.055, 8, 6);
const signals = edges.map(() => {
	const signal = new THREE.Mesh(signalGeometry, accent);
	group.add(signal);
	return signal;
});
group.rotation.y = -0.12;
const motion = document.querySelector("#motion");
const stageButtons = [...document.querySelectorAll("[data-stage]")];
const stageText = [
	["A project gives the work context.", "The tickets hold each task and its dependencies."],
	["Each agent has a task and a session.", "Follow the conversation and worktree for each assignment."],
	["The result comes back for review.", "Read the diff, check the evidence, and address the findings."],
];
let paused = motionPreference.matches;
let visible = false;
let activeStage = -1;
let phase = 0;
let selectedNode = -1;
let sceneTransition;
function renderScene() {
	renderer.render(scene, camera);
}
function setStage(stage) {
	if (stage === activeStage) return;
	activeStage = stage;
	stageButtons.forEach((button, index) => {
		button.setAttribute("aria-pressed", String(index === stage));
	});
	document.querySelector("#scene-stage-title").textContent = stageText[stage][0];
	document.querySelector("#scene-stage-copy").textContent = stageText[stage][1];
}
function drawPhase(value) {
	phase = value;
	const stage = Math.min(2, Math.floor(value * 3));
	setStage(stage);
	tileGroups.forEach((tile, index) => {
		const selected =
			selectedNode >= 0
				? index === selectedNode
				: stage === 0
					? index === 0
					: stage === 1
						? index > 0 && index < 4
						: index > 3;
		tile.position.y = selected ? 0.12 + Math.sin(((value * 3) % 1) * Math.PI) * 0.2 : 0;
	});
	signals.forEach((signal, index) => {
		const [from, to] = edges[index];
		const a = points[from],
			b = points[to],
			x = (a.x + b.x) / 2;
		const t = (value * 3 + index * 0.17) % 1;
		const route = [a, new THREE.Vector3(x, 0.02, a.z), new THREE.Vector3(x, 0.02, b.z), b];
		const part = Math.min(2, Math.floor(t * 3));
		signal.position.lerpVectors(route[part], route[part + 1], t * 3 - part);
		signal.position.y = 0.04;
		signal.visible = stage === 1 ? from === 0 : stage === 2 ? from > 0 : false;
	});
	renderScene();
}
const sceneTimeline = Motion.animate(0, 1, {
	duration: 12,
	repeat: Infinity,
	ease: "linear",
	autoplay: false,
	onUpdate: drawPhase,
});
function syncMotion() {
	motion.textContent = paused ? "Play motion" : "Pause motion";
	motion.setAttribute("aria-pressed", String(paused));
	if (paused || !visible || document.hidden) sceneTimeline.pause();
	else sceneTimeline.play();
}
function resize() {
	const { width, height } = canvas.getBoundingClientRect();
	renderer.setSize(width, height, false);
	const ratio = width / height;
	const halfHeight = Math.max(1.95, 3.65 / ratio);
	camera.left = -halfHeight * ratio;
	camera.right = halfHeight * ratio;
	camera.top = halfHeight;
	camera.bottom = -halfHeight;
	camera.updateProjectionMatrix();
	renderScene();
}
new ResizeObserver(resize).observe(canvas);
new IntersectionObserver(
	(entries) => {
		visible = entries[0].isIntersecting;
		syncMotion();
	},
	{ threshold: 0.15 },
).observe(canvas);
document.addEventListener("visibilitychange", syncMotion);
motion.addEventListener("click", () => {
	clearNodeSelection();
	paused = !paused;
	activeStage = -1;
	drawPhase(phase);
	syncMotion();
});
stageButtons.forEach((button, index) => {
	button.addEventListener("click", () => {
		clearNodeSelection();
		paused = true;
		sceneTimeline.pause();
		sceneTransition?.stop();
		const target = (index + 0.5) / 3;
		if (motionPreference.matches) drawPhase(target);
		else
			sceneTransition = Motion.animate(phase, target, { duration: 0.6, ease: [0.22, 1, 0.36, 1], onUpdate: drawPhase });
		sceneTimeline.time = target * 12;
		syncMotion();
	});
});
motionPreference.addEventListener("change", (event) => {
	paused = event.matches;
	if (event.matches) {
		sceneTransition?.stop();
		panelAnimations.forEach((control) => {
			control.complete();
		});
	}
	syncMotion();
});
drawPhase(0);
resize();
syncMotion();
const nodeButtons = [...document.querySelectorAll("[data-node]")];
const nodeDetails = [
	["Project · Account settings", "The project connects the plan, assigned agents, resources, and proposed changes."],
	["ACM-12 · Add the email endpoint", "This agent owns the endpoint. Its result is a dependency of the email form."],
	[
		"ACM-13 · Build the email form",
		"This task needs the endpoint from ACM-12. Its session keeps the interface work and conversation together.",
	],
	["ACM-15 · Verify the account flow", "A separate task checks the account flow and records its evidence."],
	[
		"Diff #42 · Save a valid address",
		"The pull request contains the proposed code, its explanation, and the test evidence.",
	],
	[
		"Review · Inspect one finding",
		"A reviewer found a missing test for an address with only spaces. Read the finding before the change ships.",
	],
];
function clearNodeSelection() {
	selectedNode = -1;
	nodeButtons.forEach((button) => {
		button.setAttribute("aria-pressed", "false");
	});
	tileGroups.forEach((tile) => {
		tile.children[1].material.color.setHex(0x8a8a86);
	});
}
function chooseNode(index) {
	selectedNode = index;
	paused = true;
	sceneTimeline.pause();
	sceneTransition?.stop();
	nodeButtons.forEach((button, i) => {
		button.setAttribute("aria-pressed", String(i === index));
	});
	tileGroups.forEach((tile, i) => {
		tile.children[1].material.color.setHex(i === index ? 0x126b60 : 0x8a8a86);
	});
	const target = (index === 0 ? 0.5 : index < 4 ? 1.5 : 2.5) / 3;
	if (motionPreference.matches) drawPhase(target);
	else
		sceneTransition = Motion.animate(phase, target, {
			duration: 0.55,
			ease: [0.22, 1, 0.36, 1],
			onUpdate: (value) => {
				drawPhase(value);
				document.querySelector("#scene-stage-title").textContent = nodeDetails[index][0];
				document.querySelector("#scene-stage-copy").textContent = nodeDetails[index][1];
			},
		});
	document.querySelector("#scene-stage-title").textContent = nodeDetails[index][0];
	document.querySelector("#scene-stage-copy").textContent = nodeDetails[index][1];
	sceneTimeline.time = target * 12;
	syncMotion();
}
nodeButtons.forEach((button, index) => {
	button.addEventListener("click", () => chooseNode(index));
});
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
function nodeAt(event) {
	const rect = canvas.getBoundingClientRect();
	pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, (-(event.clientY - rect.top) / rect.height) * 2 + 1);
	raycaster.setFromCamera(pointer, camera);
	const hit = raycaster.intersectObjects(tileGroups, true)[0];
	return hit ? hit.object.parent.userData.nodeIndex : undefined;
}
canvas.addEventListener("pointermove", (event) => {
	const index = nodeAt(event);
	canvas.style.cursor = index === undefined ? "default" : "pointer";
	canvas.title = index === undefined ? "Select a project card" : nodeDetails[index][0];
});
canvas.addEventListener("click", (event) => {
	const index = nodeAt(event);
	if (index !== undefined) chooseNode(index);
});
