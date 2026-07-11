import { NextResponse } from "next/server";

import { createApiHandler } from "@/lib/api/handler";
import { createDefaultDiscoveryRegistry } from "@/connectors/discovery";

/**
 * GET /api/connectors — public list of active discovery connectors.
 *
 * Powers the scan-progress UI (which protocols are being checked) and product
 * transparency. Metadata only — no chain access, safe to cache.
 */

export const revalidate = 3600;

export const GET = createApiHandler("connectors", async () => {
  const connectors = createDefaultDiscoveryRegistry()
    .list()
    .map((connector) => ({
      id: connector.metadata.id,
      displayName: connector.metadata.displayName,
      protocol: connector.metadata.protocol,
      chains: connector.supportedChains(),
      categories: connector.capabilities().categories,
    }));

  return NextResponse.json({ connectors });
});
