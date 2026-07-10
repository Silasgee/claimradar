/**
 * Connector SDK public surface.
 *
 * Application code should import from "@/connectors" — never from a
 * connector's internal files.
 */
export type { Connector, ConnectorContext, ConnectorMetadata } from "./connector";
export {
  ConnectorConfigurationError,
  ConnectorError,
  ConnectorExecutionError,
  ConnectorNotFoundError,
  ConnectorTimeoutError,
} from "./errors";
export { ConnectorRegistry } from "./registry";
export { MockConnector } from "./mock/mock-connector";
export { EthereumConnector } from "./ethereum/ethereum-connector";

import { ConnectorRegistry } from "./registry";
import { EthereumConnector } from "./ethereum/ethereum-connector";

/**
 * Build the default registry with every PRODUCTION connector. The
 * MockConnector is intentionally not here — it emits fake data and belongs
 * to tests, which register it explicitly.
 */
export function createDefaultRegistry(): ConnectorRegistry {
  const registry = new ConnectorRegistry();
  registry.register(new EthereumConnector());
  return registry;
}
