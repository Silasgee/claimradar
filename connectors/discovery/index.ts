/**
 * Discovery connectors — production registry.
 *
 * Application code should import from "@/connectors/discovery" — never from a
 * connector's internal files.
 */
export { MerkleDistributorConnector } from "./merkle-distributor/merkle-distributor-connector";

import { DiscoveryConnectorRegistry } from "@/lib/discovery/registry";

import { MerkleDistributorConnector } from "./merkle-distributor/merkle-distributor-connector";

/**
 * Build the default registry with every PRODUCTION discovery connector.
 * New protocol connectors register here.
 */
export function createDefaultDiscoveryRegistry(): DiscoveryConnectorRegistry {
  const registry = new DiscoveryConnectorRegistry();
  registry.register(new MerkleDistributorConnector());
  return registry;
}
