import { addDays, dateOnlyInBangkok } from "../_shared/constants.ts";
type Log = Record<string, unknown>;
type State = {
  settings: Record<string, string>;
  bookings: Log[];
  logs: Log[];
  ranges: [number, number][];
  logReadError: boolean;
  logReadErrorAt: number;
  insertError: boolean;
  insertThrows: boolean;
  fullPages: boolean;
  logReads: number;
};

let state: State;

export function resetFake(options: Partial<State> = {}) {
  state = {
    settings: { telegram_group_chat_id: "fake-staff-chat" }, bookings: [], logs: [], ranges: [],
    logReadError: false, logReadErrorAt: 0, insertError: false, insertThrows: false, fullPages: false, logReads: 0, ...options,
  };
  globalThis.__fakeSupabaseFactory = () => ({ from: (table: string) => new Query(table) });
  return state;
}

export function fakeState() { return state; }

class Query {
  private filters: Record<string, unknown> = {};
  private ranges: [number, number] | undefined;
  constructor(private table: string) {}
  select(_columns: string) { return this; }
  eq(key: string, val: unknown) { this.filters[key] = val; return this; }
  in(key: string, values: unknown[]) { this.filters[key] = values; return this; }
  order(_key: string, _options: unknown) { return this; }
  range(from: number, to: number) { this.ranges = [from, to]; return this; }
  insert(row: Log) {
    if (state.insertThrows) return Promise.reject(new Error("insert threw"));
    if (state.insertError) return Promise.resolve({ data: null, error: new Error("insert failed") });
    state.logs.push(row);
    return Promise.resolve({ data: null, error: null });
  }
  then(resolve: (result: { data: Log[] | null; error: Error | null }) => unknown) {
    if (this.table === "system_settings") {
      return Promise.resolve(resolve({ data: Object.entries(state.settings).map(([key, value]) => ({ key, value })), error: null }));
    }
    if (this.table === "bookings") {
      const [from, to] = this.ranges ?? [0, 99];
      state.ranges.push([from, to]);
      const data = state.fullPages ? Array.from({ length: 100 }, (_, i) => booking(from + i + 1)) : state.bookings.filter((row) => this.filters.appointment_date === undefined || row.appointment_date === this.filters.appointment_date).slice(from, to + 1);
      return Promise.resolve(resolve({ data, error: null }));
    }
    if (this.table === "notifications_log") {
      state.logReads += 1;
      if (state.logReadError || state.logReadErrorAt === state.logReads) return Promise.resolve(resolve({ data: null, error: new Error("log read failed") }));
      const ids = this.filters.booking_id as unknown[];
      const types = this.filters.notification_type as unknown[];
      return Promise.resolve(resolve({ data: state.logs.filter((row) => ids.includes(row.booking_id) && types.includes(row.notification_type) && (this.filters.success === undefined || row.success === this.filters.success)), error: null }));
    }
    return Promise.resolve(resolve({ data: [], error: null }));
  }
}

export function booking(id: number) {
  return { id, job_id: `JOB-${id}`, customer_name: `Customer ${id}`, phone: "fake phone", brand: "Honda", model: "ADV350", product: "Service", appointment_date: addDays(dateOnlyInBangkok(), 1), production_status: "รอเริ่มงาน" as string | null, queue_status: "ยืนยัน" as string | null, line_uid: `fake-line-${id}`, assigned_mechanic_username: null };
}
