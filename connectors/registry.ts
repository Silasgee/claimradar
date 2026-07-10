import { ConnectorConfigurationError, ConnectorNotFoundError } from "./errors";
import type { Connector } from "./connector";
import type { ScanRequest } from "@/types";

/**
 * In-memory connector registry.
 *
 * The single place the platform discovers connectors. The scan orchestrator
 * (Milestone 1) will ask the registry which connectors apply to a request and
 * fan out accordingly — it never imports connectors directly.
 */
export class ConnectorRegistry {
  private readonly connectors = new Map<string, Connector>();

  register(connector: Connector): void {
    const { id } = connector.metadata;
    if (this.connectors.has(id)) {
      throw new ConnectorConfigurationError(id, `Connector "${id}" is already registered`);
    }
    this.connectors.set(id, connector);
  }

  /** @throws ConnectorNotFoundError */
  get(id: string): Connector {
    const connector = this.connectors.get(id);
    if (!connector) {
      throw new ConnectorNotFoundError(id);
    }
    return connector;
  }

  has(id: string): boolean {
    return this.connectors.has(id);
  }

  list(): Connector[] {
    return [...this.connectors.values()];
  }

  /** Connectors whose `supports()` passes for this request (the fan-out set). */
  forRequest(request: ScanRequest): Connector[] {
    return this.list().filter((connector) => connector.supports(request));
  }

  get size(): number {
    return this.connectors.size;
  }
}
