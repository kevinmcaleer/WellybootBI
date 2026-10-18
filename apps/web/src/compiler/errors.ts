// Errors the compiler raises, after Puddle's src/compiler/errors.ts. The message is for people; the rest points the
// editor at the part of the query it concerns, so a field well can be marked.

/** Which part of a query a problem is in, and which one: the second measure is { part: 'measure', index: 1 }. */
export interface QueryPlace {
  part: 'query' | 'group' | 'measure' | 'filter' | 'sort' | 'limit';
  index?: number;
  /** The dataset field it concerns, when there is one. */
  field?: string;
}

export interface QueryProblem extends QueryPlace {
  message: string;
}

/** A query that can't be turned into SQL for its dataset. Raised before anything reaches the engine. */
export class CompileError extends Error {
  readonly place: QueryPlace;
  /** Every problem found, the first of which is the message. */
  readonly problems: QueryProblem[];

  constructor(problems: [QueryProblem, ...QueryProblem[]]) {
    const [{ message, ...place }] = problems;
    super(message);
    this.name = 'CompileError';
    this.place = place;
    this.problems = problems;
  }
}
