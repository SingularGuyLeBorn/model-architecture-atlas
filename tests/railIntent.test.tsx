// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useRailIntent } from "../src/components/useRailIntent";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("悬停停留、移出容错、导航取消及固定状态独立", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  function Demo() {
    const [preview, setPreview] = useState(false);
    const [pinned, setPinned] = useState(false);
    const intent = useRailIntent(
      () => setPreview(true),
      () => setPreview(false),
      !pinned,
    );
    return (
      <div
        data-open={preview || pinned}
        onMouseEnter={intent.cancel}
        onMouseLeave={intent.leave}
      >
        <button
          data-trigger
          onMouseEnter={intent.enter}
          onMouseLeave={intent.cancelOpening}
          onClick={() => {
            intent.dismiss();
            setPinned(!pinned);
          }}
        >
          固定
        </button>
        <button data-nav onClick={intent.dismiss}>
          跳转
        </button>
      </div>
    );
  }
  await act(async () => root.render(<Demo />));
  const frame = host.firstElementChild!;
  const trigger = host.querySelector("[data-trigger]")!;
  const enter = async () => {
    await act(async () =>
      trigger.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })),
    );
  };
  const leave = async () => {
    await act(async () =>
      frame.dispatchEvent(
        new MouseEvent("mouseout", {
          bubbles: true,
          relatedTarget: document.body,
        }),
      ),
    );
  };
  const tick = async (ms: number) => {
    await act(async () => vi.advanceTimersByTime(ms));
  };
  await enter();
  await tick(250);
  await act(async () =>
    trigger.dispatchEvent(
      new MouseEvent("mouseout", { bubbles: true, relatedTarget: frame }),
    ),
  );
  await tick(1000);
  expect(frame.getAttribute("data-open")).toBe("false");
  await enter();
  await tick(499);
  expect(frame.getAttribute("data-open")).toBe("false");
  await leave();
  await tick(1000);
  expect(frame.getAttribute("data-open")).toBe("false");
  await enter();
  await tick(500);
  expect(frame.getAttribute("data-open")).toBe("true");
  await leave();
  await tick(100);
  await act(async () =>
    frame.dispatchEvent(
      new MouseEvent("mouseover", {
        bubbles: true,
        relatedTarget: document.body,
      }),
    ),
  );
  await tick(200);
  expect(frame.getAttribute("data-open")).toBe("true");
  await act(async () =>
    host.querySelector<HTMLButtonElement>("[data-nav]")!.click(),
  );
  await tick(1000);
  expect(frame.getAttribute("data-open")).toBe("false");
  await enter();
  await tick(200);
  await act(async () =>
    host.querySelector<HTMLButtonElement>("[data-nav]")!.click(),
  );
  await tick(1000);
  expect(frame.getAttribute("data-open")).toBe("false");
  await enter();
  await tick(500);
  await act(async () =>
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  expect(frame.getAttribute("data-open")).toBe("false");
  expect(document.activeElement).toBe(trigger);
  await act(async () => (trigger as HTMLButtonElement).click());
  await leave();
  await tick(1000);
  expect(frame.getAttribute("data-open")).toBe("true");
  await act(async () => root.unmount());
  expect(vi.getTimerCount()).toBe(0);
  host.remove();
});
