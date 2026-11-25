import { cacheLife } from "next/cache";
import { serviceClient } from "./service";

// How many cards the catalogue holds: the same for everyone, so counted once an hour
// on the server instead of on every page.
export async function catalogTotal(): Promise<number> {
  return countCards();
}

async function countCards(): Promise<number> {
  "use cache";
  cacheLife("hours");
  const { count } = await serviceClient().from("cards").select("id", { count: "exact", head: true });
  return count ?? 0;
}
