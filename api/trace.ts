import { configuredService } from "../packages/pz/src/live/runtime.ts";
export default { fetch(request: Request) { return configuredService(process.env).trace(request); } };
