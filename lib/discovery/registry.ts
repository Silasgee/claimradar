import { ConnectorConfigurationError, ConnectorNotFoundError } from "@/connectors";
import type { Chain, DiscoveryRequest } from "@/types";

import type { DiscoveryConnector } from "./connector";

/**
 * In-memory discovery-connector registry.
 *
 * The single place the Discovery Engine discovers connectors. Selection is by
 * chain: a connector applies to a request if it supports at least one of the
 * requested chains (or any chain, when the request is unrestricted). A
 * connector cannot know eligibility without running, so chain overlap is the
 * only cheap pre-filter — `discover()` returns an empty result for ineligible
 * wallets.
 */
export class DiscoveryConnectorRegistry {
  private readonly connectors = new Map<string, DiscoveryConnector>();

  register(connector: DiscoveryConnector): void {
    const { id } = connector.metadata;
    if (this.connectors.has(id)) {
      throw new ConnectorConfigurationError(
        id,
        `Discovery connector "${id}" is already registered`,
      );
    }
    this.connectors.set(id, connector);
  }

  /** @throws ConnectorNotFoundError */
  get(id: string): DiscoveryConnector {
    const connector = this.connectors.get(id);
    if (!connector) throw new ConnectorNotFoundError(id);
    return connector;
  }

  has(id: string): boolean {
    return this.connectors.has(id);
  }

  list(): DiscoveryConnector[] {
    return [...this.connectors.values()];
  }

  /**
   * Connectors that support at least one requested chain (the fan-out set).
   * A connector whose `supportedChains()` throws is excluded and reported via
   * `onError` rather than failing selection.
   */
  forRequest(
    request: DiscoveryRequest,
    options?: { onError?: (connector: DiscoveryConnector, error: unknown) => void },
  ): DiscoveryConnector[] {
    const requested = request.chains;
    return this.list().filter((connector) => {
      try {
        const supported = connector.supportedChains();
        if (!requested || requested.length === 0) return supported.length > 0;
        return supported.some((chain: Chain) => requested.includes(chain));
      } catch (error) {
        options?.onError?.(connector, error);
        return false;
      }
    });
  }

  get size(): number {
    return this.connectors.size;
  }
}
