import { connection } from "next/server";
import { botUsername } from "@/lib/telegram";

export async function GET() {
  await connection();
  try {
    return Response.json({ username: await botUsername() });
  } catch (e) {
    return Response.json({ username: null, error: (e as Error).message });
  }
}
