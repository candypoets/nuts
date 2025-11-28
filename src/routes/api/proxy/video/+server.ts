import type { RequestHandler } from "./$types";
import { proxyRequest } from "../proxy";

export const GET: RequestHandler = proxyRequest;
