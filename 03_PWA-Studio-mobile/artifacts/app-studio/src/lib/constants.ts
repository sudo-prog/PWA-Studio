export const AGENT_ROLES = [
  "director",
  "design",
  "image",
  "builder",
  "tester",
  "deployer",
  "reviewer",
] as const;

export const AGENT_ROLE_COLORS: Record<string, string> = {
  director: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  design: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
  image: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  builder: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  tester: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  deployer: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  reviewer: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  system: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
};

export const PROJECT_STATUS_COLORS: Record<string, string> = {
  active: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  building: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  testing: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  deployed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  archived: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
};
