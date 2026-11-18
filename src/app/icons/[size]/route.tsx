import { ImageResponse } from "next/og";
import { AppIcon } from "@/components/AppIcon";

const SIZES = [192, 512];

export function generateStaticParams() {
  return SIZES.map((s) => ({ size: String(s) }));
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ size: string }> },
) {
  const { size } = await params;
  const px = Number(size);
  if (!SIZES.includes(px)) return new Response("Not found", { status: 404 });
  return new ImageResponse(<AppIcon size={px} />, { width: px, height: px });
}
