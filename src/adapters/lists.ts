// Shopping list on the Store (Supabase list_items via SupabaseStore later,
// MemoryStore now). Idempotent via dedupe_key; re-query is the read-back.
import type { ActionAdapter } from "../core/verify.js";
import type { ListOp, Store } from "../storage/store.js";

export interface ListCmd {
  list: string;
  ops: ListOp[];
}
export class ShoppingLists implements ActionAdapter<ListCmd, string[]> {
  name = "shopping-list";
  constructor(private store: Store) {}
  async write(
    userId: string,
    cmd: ListCmd,
    _idemKey: string,
  ): Promise<{ ackId?: string }> {
    await this.store.applyListOps(userId, cmd.list, cmd.ops);
    return { ackId: `${userId}|${cmd.list}` };
  }
  async read(userId: string, target: string): Promise<string[]> {
    return this.store.listItems(userId, target);
  }
}
