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

import { ConnectorRegistry } from "./registry";
import { MockConnector } from "./mock/mock-connector";

/**
 * Build the default registry with every production connector.
 * Real protocol connectors register here in future milestones.
 */
export function createDefaultRegistry(): ConnectorRegistry {
  const registry = new ConnectorRegistry();
  registry.register(new MockConnector());
  return registry;
}
