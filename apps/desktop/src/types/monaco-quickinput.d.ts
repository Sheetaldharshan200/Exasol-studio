/**
 * Monaco ships this ESM module without a .d.ts. Only the service identifier
 * is needed (passed to editor.invokeWithinContext's accessor) to open the
 * Quick Access palette from our own keybindings.
 */
declare module "monaco-editor/esm/vs/platform/quickinput/common/quickInput" {
  export const IQuickInputService: {
    toString(): string;
  };
}
