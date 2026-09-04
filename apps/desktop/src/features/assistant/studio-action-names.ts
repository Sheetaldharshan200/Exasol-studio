// The app-control action allow-list — dependency-free so it's unit-testable
// without loading the browser IPC layer. studio-actions.ts re-exports these.

export const STUDIO_ACTIONS = [
  "open", "close_tab", "search", "list_components", "component_status",
  "install_component", "uninstall_component", "connect", "disconnect",
  // Dashboard authoring — the assistant edits the live dashboard by op.
  "dashboard_open", "dashboard_get", "dashboard_add_widget", "dashboard_update_widget",
  "dashboard_set_layout", "dashboard_remove_widget", "dashboard_set_param", "dashboard_restyle",
] as const;
export type StudioActionName = (typeof STUDIO_ACTIONS)[number];

export function isStudioAction(name: string): name is StudioActionName {
  return (STUDIO_ACTIONS as readonly string[]).includes(name);
}
