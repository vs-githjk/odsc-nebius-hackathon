import { configuredService } from "../packages/pz/src/live/runtime.ts";
export default { async fetch(request: Request) {
  if (request.method !== "GET") return new Response("Method not allowed.", { status: 405 });
  return Response.json(await configuredService(process.env).status(), { headers: { "Cache-Control": "no-store" } });
} };
