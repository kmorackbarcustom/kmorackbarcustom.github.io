type Row = Record<string, unknown>;
type Query = {
  select(columns: string): Query;
  eq(key: string, value: unknown): Query;
  in(key: string, values: unknown[]): Query;
  order(key: string, options: unknown): Query;
  range(from: number, to: number): Query;
  insert(row: Row): Promise<{ data: Row[] | null; error: Error | null }>;
  then<TResult1 = { data: Row[] | null; error: Error | null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[] | null; error: Error | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
};

export function createClient(..._args: unknown[]) {
  return globalThis.__fakeSupabaseFactory() as { from(table: string): Query };
}

declare global {
  var __fakeSupabaseFactory: () => unknown;
}
