"""Mesh network coordinator.

Manages the overall mesh network: topology, routing decisions,
node orchestration, and self-healing when nodes go down.
"""

import logging
import threading
import time
from typing import Optional

from core.models import (
    NetworkNode, MeshRoute, MeshNetworkStats, NodeStatus
)
from discovery.scanner import DeviceScanner
from discovery.compatibility import CompatibilityChecker
from relay.configurator import RelayConfigurator
from relay.monitor import RelayMonitor

logger = logging.getLogger(__name__)


class MeshCoordinator:
    """Central coordinator for the WiFi mesh amplification network."""

    def __init__(self, config: dict):
        self.config = config
        self.nodes: dict[str, NetworkNode] = {}  # MAC -> Node
        self.routes: list[MeshRoute] = []
        self.running = False
        self._lock = threading.Lock()

        # Initialize components
        net_cfg = config.get("network", {})
        disc_cfg = config.get("discovery", {})

        self.scanner = DeviceScanner(
            scan_range=disc_cfg.get("scan_range", "192.168.1.0/24"),
            timeout=disc_cfg.get("timeout", 5),
        )
        self.checker = CompatibilityChecker()
        self.configurator = RelayConfigurator(
            mesh_ssid=net_cfg.get("mesh_ssid", "MeshAmplifier"),
            channel=net_cfg.get("channel", 6) if net_cfg.get("channel") != "auto" else 6,
            security=net_cfg.get("security", "WPA2"),
        )
        self.monitor = RelayMonitor()

        self._monitor_thread: Optional[threading.Thread] = None
        self._discovery_thread: Optional[threading.Thread] = None

    def start(self):
        """Start the mesh coordinator."""
        logger.info("Starting Mesh Coordinator")
        self.running = True

        # Initial network scan
        self.discover_devices()

        # Start background threads
        self._monitor_thread = threading.Thread(
            target=self._monitoring_loop, daemon=True
        )
        self._monitor_thread.start()

        self._discovery_thread = threading.Thread(
            target=self._discovery_loop, daemon=True
        )
        self._discovery_thread.start()

        logger.info("Mesh Coordinator started with %d nodes", len(self.nodes))

    def stop(self):
        """Stop the mesh coordinator."""
        logger.info("Stopping Mesh Coordinator")
        self.running = False

        if self._monitor_thread:
            self._monitor_thread.join(timeout=10)
        if self._discovery_thread:
            self._discovery_thread.join(timeout=10)

        logger.info("Mesh Coordinator stopped")

    def discover_devices(self) -> list[NetworkNode]:
        """Scan network and identify compatible devices."""
        logger.info("Running device discovery...")
        discovered = self.scanner.scan_network()

        new_nodes = []
        for node in discovered:
            if node.mac_address not in self.nodes:
                # Run compatibility check
                report = self.checker.check_device(node)

                with self._lock:
                    self.nodes[node.mac_address] = node

                if report.is_compatible:
                    new_nodes.append(node)
                    logger.info(
                        "New compatible device: %s (%s) - %s",
                        node.hostname, node.ip_address,
                        node.device_type.value
                    )

        return new_nodes

    def activate_relay(
        self, mac_address: str, upstream_ssid: str,
        upstream_password: str, relay_password: str
    ) -> bool:
        """Activate a discovered device as a relay node."""
        with self._lock:
            node = self.nodes.get(mac_address)

        if not node:
            logger.error("Node %s not found", mac_address)
            return False

        if not node.is_relay_capable:
            logger.error("Node %s is not relay-capable", mac_address)
            return False

        success = self.configurator.configure_relay(
            node, upstream_ssid, upstream_password, relay_password
        )

        if success:
            self._update_routes()
            logger.info("Relay activated on %s", node.hostname)

        return success

    def deactivate_relay(self, mac_address: str) -> bool:
        """Deactivate a relay node."""
        with self._lock:
            node = self.nodes.get(mac_address)

        if not node:
            return False

        success = self.configurator.deconfigure_relay(node)
        if success:
            self._update_routes()
        return success

    def get_network_stats(self) -> MeshNetworkStats:
        """Get current network statistics."""
        stats = MeshNetworkStats()

        with self._lock:
            nodes = list(self.nodes.values())

        stats.total_nodes = len(nodes)
        stats.active_relays = sum(
            1 for n in nodes if n.status == NodeStatus.RELAY_ACTIVE
        )
        stats.total_clients = sum(n.connected_clients for n in nodes)

        active_signals = [
            n.signal_strength for n in nodes if n.is_active
        ]
        if active_signals:
            stats.average_signal = sum(active_signals) / len(active_signals)

        stats.total_bandwidth = sum(n.bandwidth_usage for n in nodes)

        # Rough coverage estimate: each relay covers ~30m radius
        stats.coverage_area_estimate = (
            stats.active_relays * 3.14159 * 30 * 30
        )

        return stats

    def get_topology(self) -> dict:
        """Get the current network topology as a graph."""
        topology = {"nodes": [], "links": []}

        with self._lock:
            for node in self.nodes.values():
                topology["nodes"].append({
                    "id": node.mac_address,
                    "label": node.hostname,
                    "ip": node.ip_address,
                    "type": node.device_type.value,
                    "status": node.status.value,
                    "signal": node.signal_strength,
                    "clients": node.connected_clients,
                })

                if node.parent_node:
                    topology["links"].append({
                        "source": node.parent_node,
                        "target": node.mac_address,
                        "signal": node.signal_strength,
                    })

        return topology

    def _monitoring_loop(self):
        """Background thread: monitor active relay nodes."""
        interval = self.config.get("mesh", {}).get("heartbeat_interval", 10)

        while self.running:
            with self._lock:
                active_nodes = [
                    n for n in self.nodes.values() if n.is_active
                ]

            for node in active_nodes:
                health = self.monitor.check_node_health(node)

                if not health["reachable"]:
                    logger.warning(
                        "Node %s unreachable, triggering self-heal",
                        node.hostname
                    )
                    self._handle_node_failure(node)

            time.sleep(interval)

    def _discovery_loop(self):
        """Background thread: periodically scan for new devices."""
        interval = self.config.get("discovery", {}).get("scan_interval", 30)

        while self.running:
            time.sleep(interval)
            try:
                new_nodes = self.discover_devices()
                if new_nodes:
                    logger.info(
                        "Discovery found %d new compatible devices",
                        len(new_nodes)
                    )
            except Exception as e:
                logger.error("Discovery scan failed: %s", e)

    def _handle_node_failure(self, failed_node: NetworkNode):
        """Handle a relay node going offline (self-healing)."""
        if not self.config.get("mesh", {}).get("self_healing", True):
            return

        logger.info("Self-healing: node %s failed", failed_node.hostname)

        # Find clients that were connected through the failed node
        orphaned = []
        with self._lock:
            for node in self.nodes.values():
                if node.parent_node == failed_node.mac_address:
                    orphaned.append(node)

        # Try to reroute orphaned nodes through alternative paths
        for orphan in orphaned:
            best_alternative = self._find_best_relay(orphan)
            if best_alternative:
                logger.info(
                    "Rerouting %s through %s",
                    orphan.hostname, best_alternative.hostname
                )
                orphan.parent_node = best_alternative.mac_address
            else:
                logger.warning(
                    "No alternative route for %s", orphan.hostname
                )

        self._update_routes()

    def _find_best_relay(
        self, node: NetworkNode
    ) -> Optional[NetworkNode]:
        """Find the best active relay to connect a node through."""
        candidates = []

        with self._lock:
            for n in self.nodes.values():
                if (
                    n.mac_address != node.mac_address
                    and n.status == NodeStatus.RELAY_ACTIVE
                    and n.signal_strength > -80  # Minimum viable signal
                ):
                    candidates.append(n)

        if not candidates:
            return None

        # Select by strongest signal
        return max(candidates, key=lambda n: n.signal_strength)

    def _update_routes(self):
        """Recalculate mesh routing table."""
        new_routes = []

        with self._lock:
            active_nodes = [
                n for n in self.nodes.values() if n.is_active
            ]

        for node in active_nodes:
            if node.parent_node:
                route = MeshRoute(
                    source_mac=node.mac_address,
                    destination_mac=node.parent_node,
                    next_hop_mac=node.parent_node,
                    hop_count=1,
                    metric=abs(node.signal_strength),
                )
                new_routes.append(route)

        with self._lock:
            self.routes = new_routes

        logger.debug("Routes updated: %d active routes", len(new_routes))
