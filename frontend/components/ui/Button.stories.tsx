// src/components/ui/Button.stories.tsx — reference for every Button variant/state.
import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./Button";

const meta: Meta<typeof Button> = {
  title: "Design System/Button",
  component: Button,
  args: { children: "Start Free Prep" },
  argTypes: {
    variant: {
      control: "select",
      options: ["primary", "ghost", "elite", "danger", "outline"],
    },
    size: { control: "select", options: ["sm", "md", "lg"] },
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Primary: Story = { args: { variant: "primary" } };
export const Ghost: Story = { args: { variant: "ghost" } };
export const Elite: Story = { args: { variant: "elite" } };
export const Danger: Story = { args: { variant: "danger" } };
export const Outline: Story = { args: { variant: "outline" } };

export const Small: Story = { args: { size: "sm", variant: "primary" } };
export const Large: Story = { args: { size: "lg", variant: "primary" } };

export const Loading: Story = { args: { loading: true, variant: "primary" } };
export const Disabled: Story = { args: { disabled: true, variant: "primary" } };

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <Button variant="primary">Primary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="elite">Elite</Button>
      <Button variant="danger">Danger</Button>
      <Button variant="outline">Outline</Button>
    </div>
  ),
};
