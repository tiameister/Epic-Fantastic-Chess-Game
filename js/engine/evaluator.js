import { evaluatePosition } from "../evaluation.js";

export class HeuristicEvaluator {
  evaluate(engine, depth = 1) {
    return {
      score: evaluatePosition(engine),
      depth,
      source: "heuristic"
    };
  }
}

export class EvaluationAdapter {
  constructor(fallback = new HeuristicEvaluator()) {
    this.fallback = fallback;
    this.backend = null;
  }

  setBackend(backend) {
    this.backend = backend;
  }

  evaluate(engine, depth = 1) {
    if (this.backend && typeof this.backend.evaluate === "function") {
      return this.backend.evaluate(engine, depth);
    }
    return this.fallback.evaluate(engine, depth);
  }
}
