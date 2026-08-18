// src/components/ui/Input.stories.tsx
import type { Meta, StoryObj } from "@storybook/react";
import { Input } from "./Input";

const meta: Meta<typeof Input> = {
  title: "Design System/Input",
  component: Input,
};

export default meta;
type Story = StoryObj<typeof Input>;

export const Default: Story = {
  args: { placeholder: "Search questions...", className: "max-w-sm" },
};

export const WithValue: Story = {
  args: { defaultValue: "রক্তাক্ত প্রান্তর", className: "max-w-sm" },
};
