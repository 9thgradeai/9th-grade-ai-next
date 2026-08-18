// src/components/ui/Badge.stories.tsx
import type { Meta, StoryObj } from "@storybook/react";
import { Badge } from "./Badge";

const meta: Meta<typeof Badge> = {
  title: "Design System/Badge",
  component: Badge,
  args: { children: "ACTIVE" },
};

export default meta;
type Story = StoryObj<typeof Badge>;

export const Emerald: Story = { args: { color: "emerald" } };
export const Cyan: Story = { args: { color: "cyan", children: "NEW" } };
export const Amber: Story = { args: { color: "amber", children: "EASY" } };
export const Rose: Story = { args: { color: "rose", children: "HARD" } };
export const Violet: Story = { args: { color: "violet", children: "PREMIUM" } };
export const Zinc: Story = { args: { color: "zinc", children: "DEFAULT" } };

export const AllColors: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <Badge color="emerald">ACTIVE</Badge>
      <Badge color="cyan">NEW</Badge>
      <Badge color="amber">EASY</Badge>
      <Badge color="rose">HARD</Badge>
      <Badge color="violet">PREMIUM</Badge>
      <Badge color="zinc">DEFAULT</Badge>
    </div>
  ),
};
