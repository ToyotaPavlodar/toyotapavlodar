/** Keep updates for one row in order, without blocking other rows. */
export function createKeyedQueue() {
  const tails = new Map<string, Promise<unknown>>();
  return function enqueue<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = tails.get(key) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(task);
    tails.set(key, current);
    const cleanup = () => {
      if (tails.get(key) === current) tails.delete(key);
    };
    void current.then(cleanup, cleanup);
    return current;
  };
}

/** Return only complete results; a failed page must not look like missing leads. */
export async function collectPages<T>(
  fetchPage: (offset: number, size: number) => Promise<T[]>,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await fetchPage(offset, pageSize);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}
