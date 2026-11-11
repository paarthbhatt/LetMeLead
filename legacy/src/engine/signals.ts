import { runPipeline, type PipelineOptions, type PipelineResult } from "./pipeline.js";
import { loadTargets, type Target } from "../targets.js";

export { loadTargets };
export type { Target };
export type FindResult = PipelineResult;

export async function findMoreLeads(accountId: number, opts: PipelineOptions = {}): Promise<PipelineResult> {
  return runPipeline(accountId, opts);
}
