"use server";

import { loadSheetBoosters } from "@/lib/supabase/boosters";

// Called when the booster sheet opens, so pages don't load it up front.
export async function getSheetBoosters() {
  return loadSheetBoosters();
}
