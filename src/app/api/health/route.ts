import { NextResponse } from "next/server";
import { config } from "@/config";

export async function GET() {
  return NextResponse.json({ ok: true, replay: config.demoReplay, demo: config.demoMode });
}
