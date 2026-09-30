import type { Meta, StoryObj } from "@storybook/react-vite";
import { failure, pending, responses } from "./fixtures";
import { clickButton } from "./interactions";
import { WaveDeleteScenario } from "./WaveDeleteScenario";

const meta = {
	title: "Overlays/WaveDelete",
	component: WaveDeleteScenario,
	parameters: { trellis: { responses: { ...responses, "waves.delete": {} } } },
} satisfies Meta<typeof WaveDeleteScenario>;
export default meta;
type Story = StoryObj<typeof meta>;
const submit = async (context: { canvasElement: HTMLElement }) => {
	await clickButton("Delete wave")(context);
	await clickButton("Delete wave")(context);
};
export const ClosedTrigger: Story = {};
export const Open: Story = { play: clickButton("Delete wave") };
export const Assigned: Story = { args: { assigned: true }, play: clickButton("Delete wave") };
export const Pending: Story = { parameters: { trellis: { responses: { "waves.delete": pending } } }, play: submit };
export const RequestError: Story = {
	parameters: { trellis: { responses: { "waves.delete": failure } } },
	play: submit,
};
export const Success: Story = { play: submit };
