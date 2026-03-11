"""Network device scanner for discovering potential relay nodes.

Scans the local network to find devices that could serve as
WiFi relay/repeater nodes in the mesh network.
"""

import logging
import socket
import subprocess
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional

from core.models import (
    NetworkNode, DeviceType, NodeStatus, DeviceCapability
)

logger = logging.getLogger(__name__)


class DeviceScanner:
    """Discovers and identifies devices on the local network."""

    # Known device signatures for identification
    DEVICE_SIGNATURES = {
        DeviceType.RASPBERRY_PI: {
            "mac_prefixes": ["b8:27:eb", "dc:a6:32", "e4:5f:01", "28:cd:c1"],
            "hostname_patterns": [r"raspberrypi", r"rpi-"],
            "open_ports": [22],
        },
        DeviceType.OPENWRT: {
            "mac_prefixes": [],
            "hostname_patterns": [r"openwrt", r"lede"],
            "open_ports": [22, 80, 443],
            "http_signatures": ["LuCI", "OpenWrt"],
        },
        DeviceType.IP_CAMERA: {
            "mac_prefixes": [
                "00:62:6e",  # Hikvision
                "44:19:b6",  # Dahua
                "9c:8e:cd",  # Reolink
                "78:a5:dd",  # Shenzhen
            ],
            "open_ports": [80, 554, 8080],  # HTTP + RTSP
            "hostname_patterns": [r"cam", r"ipc", r"nvr"],
        },
        DeviceType.ANDROID: {
            "mac_prefixes": [],
            "hostname_patterns": [r"android-", r"galaxy", r"pixel"],
            "open_ports": [5555],  # ADB
        },
    }

    def __init__(self, scan_range: str = "192.168.1.0/24", timeout: int = 5):
        self.scan_range = scan_range
        self.timeout = timeout

    def scan_network(self) -> list[NetworkNode]:
        """Perform a full network scan and return discovered devices."""
        logger.info("Starting network scan on %s", self.scan_range)

        alive_hosts = self._arp_scan()
        nodes = []

        with ThreadPoolExecutor(max_workers=20) as executor:
            futures = {
                executor.submit(self._identify_device, ip, mac): (ip, mac)
                for ip, mac in alive_hosts
            }
            for future in as_completed(futures):
                node = future.result()
                if node:
                    nodes.append(node)

        logger.info("Scan complete. Found %d devices", len(nodes))
        return nodes

    def _arp_scan(self) -> list[tuple[str, str]]:
        """Use ARP to discover live hosts on the network."""
        hosts = []
        try:
            result = subprocess.run(
                ["arp-scan", "--localnet", "--retry=2", "--timeout=1000"],
                capture_output=True, text=True, timeout=30
            )
            for line in result.stdout.splitlines():
                match = re.match(
                    r"(\d+\.\d+\.\d+\.\d+)\s+([0-9a-f:]{17})", line
                )
                if match:
                    hosts.append((match.group(1), match.group(2)))
        except (subprocess.TimeoutExpired, FileNotFoundError):
            logger.warning("arp-scan failed, falling back to ping sweep")
            hosts = self._ping_sweep()

        return hosts

    def _ping_sweep(self) -> list[tuple[str, str]]:
        """Fallback: discover hosts via ping + ARP table."""
        import ipaddress

        network = ipaddress.ip_network(self.scan_range, strict=False)
        hosts = []

        def ping_host(ip):
            try:
                subprocess.run(
                    ["ping", "-c", "1", "-W", "1", str(ip)],
                    capture_output=True, timeout=3
                )
            except (subprocess.TimeoutExpired, OSError):
                pass

        with ThreadPoolExecutor(max_workers=50) as executor:
            executor.map(ping_host, network.hosts())

        try:
            result = subprocess.run(
                ["arp", "-an"], capture_output=True, text=True, timeout=5
            )
            for line in result.stdout.splitlines():
                match = re.match(
                    r"\? \((\d+\.\d+\.\d+\.\d+)\) at ([0-9a-f:]{17})", line
                )
                if match:
                    hosts.append((match.group(1), match.group(2)))
        except subprocess.TimeoutExpired:
            pass

        return hosts

    def _identify_device(self, ip: str, mac: str) -> Optional[NetworkNode]:
        """Identify a device type and its capabilities."""
        node = NetworkNode(ip_address=ip, mac_address=mac)

        # Try to resolve hostname
        try:
            node.hostname = socket.gethostbyaddr(ip)[0]
        except socket.herror:
            node.hostname = f"device-{mac.replace(':', '')[-6:]}"

        # Identify device type
        node.device_type = self._match_device_type(mac, node.hostname, ip)

        # Check capabilities via SSH probe
        capabilities = self._probe_capabilities(ip, node.device_type)
        node.capabilities = capabilities

        if node.is_relay_capable:
            node.status = NodeStatus.COMPATIBLE
        elif node.device_type != DeviceType.UNKNOWN:
            node.status = NodeStatus.DISCOVERED
        else:
            node.status = NodeStatus.INCOMPATIBLE

        # Get signal strength if possible
        node.signal_strength = self._get_signal_strength(ip, mac)

        logger.info(
            "Identified %s (%s) as %s - %s",
            ip, node.hostname, node.device_type.value, node.status.value
        )
        return node

    def _match_device_type(
        self, mac: str, hostname: str, ip: str
    ) -> DeviceType:
        """Match a device to a known type using signatures."""
        mac_lower = mac.lower()
        hostname_lower = hostname.lower()

        for dev_type, sigs in self.DEVICE_SIGNATURES.items():
            # Check MAC prefix
            for prefix in sigs.get("mac_prefixes", []):
                if mac_lower.startswith(prefix):
                    return dev_type

            # Check hostname pattern
            for pattern in sigs.get("hostname_patterns", []):
                if re.search(pattern, hostname_lower):
                    return dev_type

        # If SSH is open, likely a Linux device
        if self._is_port_open(ip, 22):
            return DeviceType.LINUX_EMBEDDED

        return DeviceType.UNKNOWN

    def _probe_capabilities(
        self, ip: str, device_type: DeviceType
    ) -> list[DeviceCapability]:
        """Probe a device to determine its WiFi capabilities."""
        capabilities = []

        if device_type == DeviceType.UNKNOWN:
            return capabilities

        # All identified Linux devices can potentially forward packets
        if device_type in (
            DeviceType.LINUX_EMBEDDED,
            DeviceType.OPENWRT,
            DeviceType.RASPBERRY_PI,
        ):
            capabilities.append(DeviceCapability.STATION_MODE)
            capabilities.append(DeviceCapability.PACKET_FORWARD)

        # OpenWrt and Pi can usually do AP mode
        if device_type in (DeviceType.OPENWRT, DeviceType.RASPBERRY_PI):
            capabilities.append(DeviceCapability.AP_MODE)
            capabilities.append(DeviceCapability.MESH_SUPPORT)

        # IP cameras typically have station mode only
        if device_type == DeviceType.IP_CAMERA:
            capabilities.append(DeviceCapability.STATION_MODE)
            # Some cameras with Linux can forward packets
            if self._is_port_open(ip, 22):
                capabilities.append(DeviceCapability.PACKET_FORWARD)
                capabilities.append(DeviceCapability.AP_MODE)

        return capabilities

    def _get_signal_strength(self, ip: str, mac: str) -> int:
        """Get the WiFi signal strength for a device."""
        try:
            result = subprocess.run(
                ["iw", "dev", "wlan0", "station", "dump"],
                capture_output=True, text=True, timeout=5
            )
            current_mac = ""
            for line in result.stdout.splitlines():
                if "Station" in line:
                    current_mac = line.split()[1].lower()
                elif (
                    "signal:" in line.lower()
                    and current_mac == mac.lower()
                ):
                    match = re.search(r"(-?\d+)", line)
                    if match:
                        return int(match.group(1))
        except (subprocess.TimeoutExpired, FileNotFoundError):
            pass

        return -50  # Default assumption

    @staticmethod
    def _is_port_open(ip: str, port: int, timeout: float = 2.0) -> bool:
        """Check if a TCP port is open on a host."""
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                sock.settimeout(timeout)
                return sock.connect_ex((ip, port)) == 0
        except OSError:
            return False
