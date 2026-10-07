import { assertLocalDev, hasAdminSession } from "@/lib/admin-access";
import { seedThirtyLanguages } from "@/lib/seed-languages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  await assertLocalDev();
  if (!(await hasAdminSession())) {
    return Response.json({ message: "沒有管理權限" }, { status: 404 });
  }

  try {
    const summary = await seedThirtyLanguages();
    return Response.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : "種子題寫入失敗";
    return Response.json({ message }, { status: 500 });
  }
}
