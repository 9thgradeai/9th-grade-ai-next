// src/components/ui/Card.stories.tsx
import type { Meta, StoryObj } from "@storybook/react";
import { Card } from "./Card";

const meta: Meta<typeof Card> = {
  title: "Design System/Card",
  component: Card,
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  args: { children: <div className="p-4 text-zinc-200 font-mono">Terminal card surface</div> },
};

export const Glow: Story = {
  args: {
    glow: true,
    children: <div className="p-4 text-emerald-400 font-mono">Glowing card</div>,
  },
};
