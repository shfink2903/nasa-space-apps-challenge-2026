import type { Resources } from "../data/resources";
import type { Strings } from "../i18n";
import type { Actions, AppState, Store } from "../state";
import type { Format } from "./format";

/** What every panel gets. Rebuilt when the language changes. */
export interface Ui {
  store: Store;
  actions: Actions;
  resources: Resources;
  t: Strings;
  fmt: Format;
  /**
   * Runs `draw` now, and again each time one of the values returned by `pick`
   * changes. The subscription ends when the interface is rebuilt.
   */
  watch(pick: (state: AppState) => unknown[], draw: (state: AppState) => void): void;
  /** Registers something to undo when the interface is rebuilt (observers, timers). */
  onDispose(dispose: () => void): void;
}

export function createUi(store: Store, actions: Actions, resources: Resources, t: Strings, fmt: Format): Ui & { dispose(): void } {
  const disposers: (() => void)[] = [];
  return {
    store,
    actions,
    resources,
    t,
    fmt,
    watch(pick, draw) {
      let last = pick(store.get());
      draw(store.get());
      disposers.push(
        store.subscribe((state) => {
          const next = pick(state);
          if (next.length === last.length && next.every((v, i) => v === last[i])) return;
          last = next;
          draw(state);
        }),
      );
    },
    onDispose: (dispose) => void disposers.push(dispose),
    dispose() {
      for (const d of disposers.splice(0)) d();
    },
  };
}
