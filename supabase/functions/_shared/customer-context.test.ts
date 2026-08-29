import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  formatOrderForAgent,
  getCustomerContext,
  type Order,
} from "./customer-context.ts";

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    order_id: "ORD-TEST",
    customer_name: "Test Customer",
    brand: "Honda",
    model: "CT125",
    items: ["แร็คข้าง"],
    status: "done",
    due_date: "2026-08-31",
    note: null,
    ...overrides,
  };
}

Deno.test("order grounding labels the real Sumo customer and vehicle", () => {
  const context = formatOrderForAgent(makeOrder({
    order_id: "ORD-20260824-42EF",
    customer_name: "Sumo",
    brand: "Suzuki",
    model: "V Strom 800 de",
    items: ["แร็คข้าง"],
  }));

  assertStringIncludes(context, "ชื่อลูกค้า: Sumo");
  assertStringIncludes(context, "รถ: Suzuki V Strom 800 de");
  assertStringIncludes(context, "รายการ: แร็คข้าง");
  assertEquals(context.includes("รถ: Sumo"), false);
});

Deno.test("order grounding never fabricates a missing vehicle", () => {
  const context = formatOrderForAgent(makeOrder({
    customer_name: "Sumo",
    brand: null,
    model: null,
  }));

  assertStringIncludes(context, "ชื่อลูกค้า: Sumo");
  assertStringIncludes(context, "รถ: ไม่มีข้อมูลในระบบ");
  assertEquals(context.includes("รถ: Sumo"), false);
});

Deno.test("motorcycle-like customer names stay customer names only", () => {
  for (const customerName of ["Wave", "Click", "PCX"]) {
    const context = formatOrderForAgent(makeOrder({
      customer_name: customerName,
      brand: null,
      model: null,
    }));
    assertStringIncludes(context, `ชื่อลูกค้า: ${customerName}`);
    assertStringIncludes(context, "รถ: ไม่มีข้อมูลในระบบ");
    assertEquals(context.includes(`รถ: ${customerName}`), false);
  }
});

type FakeRow = Record<string, unknown>;
type FakeResult = { data: FakeRow[]; error: null };

class FakeSelectQuery implements PromiseLike<FakeResult> {
  constructor(private rows: FakeRow[]) {}

  eq(column: string, value: unknown): this {
    this.rows = this.rows.filter((row) => row[column] === value);
    return this;
  }

  is(column: string, value: unknown): this {
    this.rows = this.rows.filter((row) => row[column] === value);
    return this;
  }

  order(_column: string, _options?: unknown): this {
    return this;
  }

  limit(count: number): this {
    this.rows = this.rows.slice(0, count);
    return this;
  }

  then<TResult1 = FakeResult, TResult2 = never>(
    onfulfilled?:
      | ((value: FakeResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve({ data: this.rows, error: null }).then(
      onfulfilled,
      onrejected,
    );
  }
}

class FakeSupabase {
  readonly selectedColumns: Record<string, string> = {};

  constructor(private readonly tables: Record<string, FakeRow[]>) {}

  from(table: string) {
    return {
      select: (columns: string) => {
        this.selectedColumns[table] = columns;
        return new FakeSelectQuery([...(this.tables[table] ?? [])]);
      },
    };
  }
}

Deno.test("order context keeps LINE user identity isolation", async () => {
  const fake = new FakeSupabase({
    bookings: [],
    orders: [{
      line_user_id: "line-A",
      ...makeOrder({
        order_id: "ORD-A",
        customer_name: "Alice",
        model: "ADV350",
      }),
    }, {
      line_user_id: "line-B",
      ...makeOrder({
        order_id: "ORD-B",
        customer_name: "Bob",
        model: "XMAX",
      }),
    }],
  });

  const context = await getCustomerContext(
    fake as unknown as Parameters<typeof getCustomerContext>[0],
    "line-A",
  );

  assertStringIncludes(context, "ORD-A");
  assertStringIncludes(context, "ชื่อลูกค้า: Alice");
  assertEquals(context.includes("ORD-B"), false);
  assertEquals(context.includes("ชื่อลูกค้า: Bob"), false);
  assertEquals(
    fake.selectedColumns.orders,
    "order_id, customer_name, brand, model, items, status, due_date, note",
  );
});
