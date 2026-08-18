import type { StorybookConfig } from "@storybook/react";

const config: StorybookConfig = {
  stories: ["../frontend/components/**/*.stories.@(js|jsx|mjs|ts|tsx)"],
  addons: ["@storybook/addon-essentials"],
  framework: {
    name: "@storybook/react",
    options: {},
  },
  docs: {
    autodocs: true,
  },
};

export default config;
