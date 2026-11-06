/** Native text editing owns undo inside every editable control, including custom
 * contenteditable descendants. This helper does not read or change plan state. */
export function isTextEditingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || Boolean(target.closest('input, textarea, select, [role="textbox"]')));
}
