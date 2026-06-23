import { defineRelations } from "drizzle-orm";
import { schema } from "./schema.ts";

export const relations = defineRelations(schema, (tables) => ({
  user: {
    accounts: tables.many.account(),
    sessions: tables.many.session(),
  },
  session: {
    user: tables.one.user({
      from: tables.session.userId,
      to: tables.user.id,
    }),
  },
  account: {
    user: tables.one.user({
      from: tables.account.userId,
      to: tables.user.id,
    }),
  },
}));
