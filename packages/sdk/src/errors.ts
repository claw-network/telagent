import type { ProblemDetail } from '@telagent/protocol';

export class TelagentSdkError extends Error {
  readonly status: number;
  readonly problem: ProblemDetail;

  constructor(problem: ProblemDetail) {
    super(problem.detail ?? problem.title);
    this.problem = problem;
    this.status = problem.status;
  }
}
