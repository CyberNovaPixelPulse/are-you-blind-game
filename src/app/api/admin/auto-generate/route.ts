import { assertLocalDev, hasAdminSession } from "@/lib/admin-access";
import { generateAutoQuiz } from "@/lib/auto-quiz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  await assertLocalDev();
  if (!(await hasAdminSession())) {
    return Response.json({ message: "沒有管理權限" }, { status: 404 });
  }

  try {
    const question = await generateAutoQuiz();
    return Response.json({ question });
  } catch (error) {
    const message = error instanceof Error ? error.message : "出題失敗，請再試一次";
    return Response.json({ message }, { status: 500 });
  }
}
