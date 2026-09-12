// chameleye.config.ts — optional, zero-config by default (flowmap.config.ts also supported for legacy)
export default {
  project: {
    language: "typescript",
    root: ".",
  },
  analysis: {
    include: ["src/**", "app/**", "pages/**", "routes/**"],
    exclude: ["node_modules/**", "dist/**", "coverage/**", ".opencode/**"],
  },
  integrations: {
    postgres: true,
    redis: true,
    kafka: true,
  },
};
