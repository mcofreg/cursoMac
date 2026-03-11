"""Relay node monitoring.

Monitors active relay nodes for health, signal strength,
bandwidth usage, and client connections.
"""

import logging
import re
import time
from typing import Optional

import paramiko

from core.models import NetworkNode, NodeStatus

logger = logging.getLogger(__name__)


class RelayMonitor:
    """Monitors health and performance of relay nodes."""

    def __init__(self, ssh_username: str = "root", ssh_key_path: str = None):
        self.ssh_username = ssh_username
        self.ssh_key_path = ssh_key_path

    def check_node_health(self, node: NetworkNode) -> dict:
        """Perform a health check on a relay node."""
        health = {
            "reachable": False,
            "relay_running": False,
            "signal_strength": 0,
            "connected_clients": 0,
            "cpu_usage": 0.0,
            "memory_usage": 0.0,
            "bandwidth_tx": 0.0,
            "bandwidth_rx": 0.0,
            "uptime": 0.0,
        }

        try:
            client = self._connect(node.ip_address)
            if not client:
                node.status = NodeStatus.UNREACHABLE
                return health

            health["reachable"] = True
            health["relay_running"] = self._is_relay_running(client)
            health["signal_strength"] = self._get_signal(client)
            health["connected_clients"] = self._count_clients(client)
            health["cpu_usage"] = self._get_cpu_usage(client)
            health["memory_usage"] = self._get_memory_usage(client)

            tx, rx = self._get_bandwidth(client)
            health["bandwidth_tx"] = tx
            health["bandwidth_rx"] = rx

            health["uptime"] = self._get_uptime(client)

            # Update node model
            node.signal_strength = health["signal_strength"]
            node.connected_clients = health["connected_clients"]
            node.bandwidth_usage = health["bandwidth_tx"] + health["bandwidth_rx"]
            node.last_seen = time.time()

            if health["relay_running"]:
                node.status = NodeStatus.RELAY_ACTIVE
            else:
                node.status = NodeStatus.ACTIVE

            client.close()

        except Exception as e:
            logger.error("Health check failed for %s: %s",
                         node.ip_address, e)
            node.status = NodeStatus.UNREACHABLE

        return health

    def _connect(self, ip: str) -> Optional[paramiko.SSHClient]:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
            kwargs = {
                "hostname": ip, "username": self.ssh_username, "timeout": 10
            }
            if self.ssh_key_path:
                kwargs["key_filename"] = self.ssh_key_path
            else:
                kwargs["look_for_keys"] = True
            client.connect(**kwargs)
            return client
        except Exception:
            return None

    def _run(self, client: paramiko.SSHClient, cmd: str) -> str:
        _, stdout, _ = client.exec_command(cmd, timeout=10)
        return stdout.read().decode("utf-8", errors="replace").strip()

    def _is_relay_running(self, client) -> bool:
        result = self._run(client, "pgrep -x hostapd")
        return bool(result)

    def _get_signal(self, client) -> int:
        output = self._run(client, "iw dev wlan0 link 2>/dev/null")
        match = re.search(r"signal:\s*(-?\d+)", output)
        return int(match.group(1)) if match else -100

    def _count_clients(self, client) -> int:
        output = self._run(
            client, "iw dev wlan0_ap station dump 2>/dev/null | grep Station | wc -l"
        )
        try:
            return int(output)
        except ValueError:
            return 0

    def _get_cpu_usage(self, client) -> float:
        output = self._run(
            client,
            "top -bn1 | grep 'Cpu(s)' | awk '{print $2}' 2>/dev/null"
        )
        try:
            return float(output)
        except ValueError:
            return 0.0

    def _get_memory_usage(self, client) -> float:
        output = self._run(
            client,
            "free | awk '/Mem:/ {printf \"%.1f\", $3/$2*100}' 2>/dev/null"
        )
        try:
            return float(output)
        except ValueError:
            return 0.0

    def _get_bandwidth(self, client) -> tuple[float, float]:
        """Get current TX/RX bandwidth in Mbps."""
        iface = "wlan0"
        rx1 = self._run(
            client, f"cat /sys/class/net/{iface}/statistics/rx_bytes"
        )
        tx1 = self._run(
            client, f"cat /sys/class/net/{iface}/statistics/tx_bytes"
        )

        self._run(client, "sleep 1")

        rx2 = self._run(
            client, f"cat /sys/class/net/{iface}/statistics/rx_bytes"
        )
        tx2 = self._run(
            client, f"cat /sys/class/net/{iface}/statistics/tx_bytes"
        )

        try:
            rx_mbps = (int(rx2) - int(rx1)) * 8 / 1_000_000
            tx_mbps = (int(tx2) - int(tx1)) * 8 / 1_000_000
            return tx_mbps, rx_mbps
        except (ValueError, ZeroDivisionError):
            return 0.0, 0.0

    def _get_uptime(self, client) -> float:
        output = self._run(client, "cat /proc/uptime | awk '{print $1}'")
        try:
            return float(output)
        except ValueError:
            return 0.0
