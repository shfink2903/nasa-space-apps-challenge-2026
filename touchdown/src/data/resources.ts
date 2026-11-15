/**
 * Lazy, cached access to dataset files. A view asks for a file; if it is not
 * here yet the answer is `undefined`, the download starts, and `onChange` is
 * called when it arrives so the view can draw again.
 */
import {
  loadHorizon,
  loadScenario,
  loadSensitivity,
  loadSeries,
  loadSweep,
  type HorizonProfile,
  type Model,
  type Scenario,
  type Sensitivity,
  type Series,
  type Sweep,
} from "./dataset";
import { assertComparisonResponse, type ComparisonRequest, type ComparisonResult } from "../planner/comparison";

/** Everything the views need for one scenario. */
export interface Bundle {
  scenario: Scenario;
  series: Series;
  /** Null when the scenario has no terrain horizon. */
  horizon: HorizonProfile | null;
}

interface Entry<T> {
  value?: T;
  failed?: boolean;
}

export class Resources {
  private readonly cache = new Map<string, Entry<unknown>>();
  private notifyQueued = false;

  constructor(private readonly onChange: () => void) {}

  sweep(siteId: string, heightM: number, model: Model): Sweep | undefined {
    return this.get(`sweep:${siteId}:${heightM}:${model}`, () => loadSweep(siteId, heightM, model));
  }

  sensitivity(siteId: string, heightM: number): Sensitivity | undefined {
    return this.get(`sens:${siteId}:${heightM}`, () => loadSensitivity(siteId, heightM));
  }

  bundle(scenarioId: string): Bundle | undefined {
    return this.get(`bundle:${scenarioId}`, async () => {
      const scenario = await loadScenario(scenarioId);
      const [series, horizon] = await Promise.all([loadSeries(scenario), loadHorizon(scenario)]);
      return { scenario, series, horizon };
    });
  }

  /** True when the download of this scenario failed. */
  bundleFailed(scenarioId: string): boolean {
    return this.cache.get(`bundle:${scenarioId}`)?.failed === true;
  }

  /** Requests are keyed by the complete selection, priority and constraints. */
  comparison(request: ComparisonRequest): ComparisonResult | undefined {
    return this.get(`comparison:${JSON.stringify(request)}`, async () => {
      const response = await fetch("/api/compare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error(`Comparison API unavailable (${response.status})`);
      const result: unknown = await response.json();
      assertComparisonResponse(result, request);
      return result;
    });
  }

  comparisonFailed(request: ComparisonRequest): boolean {
    return this.cache.get(`comparison:${JSON.stringify(request)}`)?.failed === true;
  }

  private get<T>(key: string, load: () => Promise<T>): T | undefined {
    let entry = this.cache.get(key) as Entry<T> | undefined;
    if (!entry) {
      entry = {};
      this.cache.set(key, entry);
      const target = entry;
      load().then(
        (value) => {
          target.value = value;
          this.notify();
        },
        (error) => {
          console.error(error);
          target.failed = true;
          this.notify();
        },
      );
    }
    return entry.value;
  }

  /** Many files can arrive in the same instant: tell the views once. */
  private notify(): void {
    if (this.notifyQueued) return;
    this.notifyQueued = true;
    queueMicrotask(() => {
      this.notifyQueued = false;
      this.onChange();
    });
  }
}
