// The app-control action allow-list — dependency-free so it's unit-testable
// without loading the browser IPC layer. studio-actions.ts re-exports these.

export const STUDIO_ACTIONS = [
  "open", "close_tab", "search", "list_components", "component_status",
  "install_component", "uninstall_component", "connect", "disconnect",
] as const;
export type StudioActionName = (typeof STUDIO_ACTIONS)[number];

export function isStudioAction(name: string): name is StudioActionName {
  return (STUDIO_ACTIONS as readonly string[]).includes(name);
}
