import { Hono } from "hono";
import { IDENTITY_HEADER, resolveIdentity } from "./identity";

export { HouseholdDO } from "./household-do";

const app = new Hono<{ Bindings: Env }>();

// Static assets are served by Workers Assets; only /trpc/* reaches this Worker.
app.all("/trpc/*", async (c) => {
  const identity = await resolveIdentity(c.req.raw, c.env);
  if (!identity) {
    return c.json({ error: { message: "Unauthorized", code: -32001, data: { code: "UNAUTHORIZED", httpStatus: 401 } } }, 401);
  }
  const id = c.env.HOUSEHOLD.idFromName(identity.household.id);
  const stub = c.env.HOUSEHOLD.get(id, { locationHint: "oc" });

  // The DO is only reachable through this Worker, so it can trust this header.
  const headers = new Headers(c.req.raw.headers);
  headers.set(IDENTITY_HEADER, encodeURIComponent(JSON.stringify(identity)));
  return stub.fetch(new Request(c.req.raw, { headers }));
});

app.all("*", (c) => c.notFound());

export default app satisfies ExportedHandler<Env>;
