type Page<T> = { data: T[] | null; error: { message: string } | null };

// PostgREST caps each response (max_rows, 1000 by default): read in pages.
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<Page<T>>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) return all;
  }
}
