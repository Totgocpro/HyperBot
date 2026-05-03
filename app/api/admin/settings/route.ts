import { RequireSuperAdmin } from "@/src/Web/Auth";

async function Get(Request: Request): Promise<Response> {
  try {
    await RequireSuperAdmin(Request);
  } catch (ResponseValue) {
    return ResponseValue as Response;
  }

  return new Response("Admin settings endpoint has been removed.", { status: 410 });
}

export { Get as GET };
