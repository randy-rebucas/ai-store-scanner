import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  checkScanAllowed,
  collectStoreData,
  completeScan,
  createScan,
  failScan,
  generateRecommendations,
  pruneOldScans,
} from "../models/scan.server";
import { getActivePlan, scanLimitForPlan } from "../models/billing.server";

// Streams newline-delimited JSON progress events for a single scan run, then
// a final {type:"done"} event, all within one request/response cycle.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session, billing } = await authenticate.admin(request);

  const encoder = new TextEncoder();
  let controllerRef: ReadableStreamDefaultController<Uint8Array>;

  const send = (event: Record<string, unknown>) => {
    controllerRef.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controllerRef = controller;

      const activePlan = await getActivePlan(billing);
      const allowed = await checkScanAllowed(
        session.shop,
        scanLimitForPlan(activePlan),
      );
      if (!allowed.allowed) {
        send({ type: "done", ok: false, error: allowed.reason });
        controller.close();
        return;
      }

      send({ type: "log", message: "Starting scan..." });
      const scan = await createScan(session.shop);

      try {
        const storeData = await collectStoreData(admin, (message) =>
          send({ type: "log", message }),
        );
        const recommendations = await generateRecommendations(
          session.shop,
          storeData,
          (message) => send({ type: "log", message }),
        );
        send({ type: "log", message: "Saving scan results..." });
        await completeScan(scan.id, storeData, recommendations);
        await pruneOldScans(session.shop);
        send({ type: "done", ok: true, scanId: scan.id });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Scan failed";
        await failScan(scan.id, message);
        send({ type: "done", ok: false, error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
};
