import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type FocusEvent,
  type MouseEvent,
} from "react";

// [OM-FREEPLAY] 采用 500ms 意图停留和 160ms 移出容错；具体时长是本项目选择。
export const RAIL_HOVER_DELAY = 500;
export const RAIL_LEAVE_DELAY = 160;

/** 延迟只用于悬停意图；关闭、导航与卸载同步取消待执行动作。 */
export function useRailIntent(
  onOpen: () => void,
  onClose: () => void,
  enabled = true,
) {
  const callbacks = useRef({ onOpen, onClose, enabled });
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingKind = useRef<"open" | "leave" | null>(null);
  const active = useRef(false);
  const trigger = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    callbacks.current = { onOpen, onClose, enabled };
  });
  const cancel = useCallback(() => {
    if (pending.current !== null) clearTimeout(pending.current);
    pending.current = null;
    pendingKind.current = null;
  }, []);
  const cancelOpening = useCallback(() => {
    if (pendingKind.current === "open") cancel();
  }, [cancel]);
  useEffect(() => cancel, [cancel]);
  useEffect(() => {
    if (!enabled) cancel();
  }, [enabled, cancel]);
  const dismiss = useCallback(() => {
    cancel();
    active.current = false;
    callbacks.current.onClose();
  }, [cancel]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (
        event.key !== "Escape" ||
        (!active.current && pending.current === null)
      )
        return;
      trigger.current?.focus({ preventScroll: true });
      dismiss();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [dismiss]);
  const enter = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      trigger.current = event.currentTarget;
      cancel();
      if (
        !callbacks.current.enabled ||
        window.matchMedia?.("(hover: none)").matches
      )
        return;
      pendingKind.current = "open";
      pending.current = setTimeout(() => {
        pending.current = null;
        if (callbacks.current.enabled) {
          active.current = true;
          callbacks.current.onOpen();
        }
      }, RAIL_HOVER_DELAY);
    },
    [cancel],
  );
  const leave = useCallback(() => {
    cancel();
    if (!active.current) return;
    pendingKind.current = "leave";
    pending.current = setTimeout(() => {
      pending.current = null;
      active.current = false;
      callbacks.current.onClose();
    }, RAIL_LEAVE_DELAY);
  }, [cancel]);
  const focus = useCallback(
    (event: FocusEvent<HTMLElement>) => {
      if (event.target.matches(":focus-visible") && callbacks.current.enabled) {
        trigger.current = event.currentTarget;
        active.current = true;
        cancel();
        callbacks.current.onOpen();
      }
    },
    [cancel],
  );
  const blur = useCallback(
    (event: FocusEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget)) dismiss();
    },
    [dismiss],
  );
  return { enter, leave, cancel, cancelOpening, dismiss, focus, blur };
}
