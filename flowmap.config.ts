// flowmap.config.ts — optional, zero-config by default
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
