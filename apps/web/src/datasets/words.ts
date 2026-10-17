import { fullCount } from '../ui';

/** A count and its noun: "1 row", "1,204 rows". */
export const counted = (n: number, noun: string) => `${fullCount(n)} ${n === 1 ? noun : `${noun}s`}`;
