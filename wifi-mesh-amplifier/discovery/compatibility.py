"""Device compatibility checker.

Connects to discovered devices to verify they can function
as WiFi relay nodes by checking OS, WiFi drivers, and capabilities.
"""

import logging
import re
from dataclasses import dataclass
from typing import Optional

import paramiko

from core.models import (
    NetworkNode, DeviceCapability, WiFiInterface, NodeStatus
)

logger = logging.getLogger(__name__)


@dataclass
class CompatibilityReport:
    """Result of a compatibility check on a device."""
    device_ip: str
    is_compatible: bool
    os_info: str = ""
    kernel_version: str = ""
    wifi_interfaces: list = None
    can_create_ap: bool = False
    can_forward_packets: bool = False
    has_mesh_support: bool = False
    missing_requirements: list = None
    recommendations: list = None

    def __post_init__(self):
        if self.wifi_interfaces is None:
            self.wifi_interfaces = []
        if self.missing_requirements is None:
            self.missing_requirements = []
        if self.recommendations is None:
            self.recommendations = []


class CompatibilityChecker:
    """Verifies device compatibility for mesh relay operation."""

    # Required kernel modules for relay operation
    REQUIRED_MODULES = ["mac80211", "cfg80211"]
    MESH_MODULES = ["batman-adv", "mac80211_hwsim"]
    RELAY_TOOLS = ["hostapd", "wpa_supplicant", "iw", "iptables"]

    def __init__(self, ssh_username: str = "root", ssh_key_path: str = None):
        self.ssh_username = ssh_username
        self.ssh_key_path = ssh_key_path

    def check_device(self, node: NetworkNode) -> CompatibilityReport:
        """Run a full compatibility check on a device."""
        report = CompatibilityReport(device_ip=node.ip_address)

        try:
            client = self._connect_ssh(node.ip_address)
            if not client:
                report.missing_requirements.append("SSH access required")
                return report

            report.os_info = self._get_os_info(client)
            report.kernel_version = self._get_kernel_version(client)
            report.wifi_interfaces = self._detect_wifi_interfaces(client)
            report.can_create_ap = self._check_ap_capability(client)
            report.can_forward_packets = self._check_forwarding(client)
            report.has_mesh_support = self._check_mesh_support(client)

            # Check required tools
            missing_tools = self._check_required_tools(client)
            report.missing_requirements.extend(missing_tools)

            # Determine overall compatibility
            report.is_compatible = (
                len(report.wifi_interfaces) > 0
                and report.can_forward_packets
                and (report.can_create_ap or report.has_mesh_support)
            )

            # Generate recommendations
            if not report.can_create_ap and report.wifi_interfaces:
                report.recommendations.append(
                    "Install hostapd for AP mode support"
                )
            if not report.has_mesh_support:
                report.recommendations.append(
                    "Install batman-adv for mesh networking"
                )
            if missing_tools:
                report.recommendations.append(
                    f"Install missing tools: {', '.join(missing_tools)}"
                )

            # Update node status
            if report.is_compatible:
                node.status = NodeStatus.COMPATIBLE
                node.capabilities = self._build_capabilities(report)

            client.close()

        except Exception as e:
            logger.error("Compatibility check failed for %s: %s",
                         node.ip_address, e)
            report.missing_requirements.append(f"Check failed: {e}")

        return report

    def _connect_ssh(self, ip: str) -> Optional[paramiko.SSHClient]:
        """Establish SSH connection to the device."""
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

        try:
            connect_kwargs = {
                "hostname": ip,
                "username": self.ssh_username,
                "timeout": 10,
            }
            if self.ssh_key_path:
                connect_kwargs["key_filename"] = self.ssh_key_path
            else:
                connect_kwargs["look_for_keys"] = True

            client.connect(**connect_kwargs)
            return client
        except Exception as e:
            logger.debug("SSH connection failed to %s: %s", ip, e)
            return None

    def _run_command(self, client: paramiko.SSHClient, cmd: str) -> str:
        """Execute a command via SSH and return stdout."""
        _, stdout, _ = client.exec_command(cmd, timeout=10)
        return stdout.read().decode("utf-8", errors="replace").strip()

    def _get_os_info(self, client: paramiko.SSHClient) -> str:
        return self._run_command(client, "cat /etc/os-release 2>/dev/null | head -5")

    def _get_kernel_version(self, client: paramiko.SSHClient) -> str:
        return self._run_command(client, "uname -r")

    def _detect_wifi_interfaces(
        self, client: paramiko.SSHClient
    ) -> list[WiFiInterface]:
        """Detect WiFi interfaces and their capabilities."""
        interfaces = []
        output = self._run_command(client, "iw dev 2>/dev/null")

        if not output:
            return interfaces

        current_iface = None
        for line in output.splitlines():
            line = line.strip()

            if line.startswith("Interface"):
                if current_iface:
                    interfaces.append(current_iface)
                name = line.split()[-1]
                mac = self._run_command(
                    client, f"cat /sys/class/net/{name}/address"
                )
                # Get driver info
                driver = self._run_command(
                    client,
                    f"readlink /sys/class/net/{name}/device/driver 2>/dev/null"
                    " | xargs basename 2>/dev/null"
                )
                current_iface = WiFiInterface(
                    name=name, mac_address=mac, driver=driver or "unknown"
                )

        if current_iface:
            interfaces.append(current_iface)

        # Check capabilities for each interface
        for iface in interfaces:
            phy = self._run_command(
                client,
                f"iw dev {iface.name} info 2>/dev/null"
                " | grep wiphy | awk '{{print $2}}'"
            )
            if phy:
                phy_info = self._run_command(
                    client, f"iw phy phy{phy} info 2>/dev/null"
                )
                iface.supports_ap = "* AP" in phy_info
                iface.supports_mesh = "* mesh point" in phy_info

                # Detect frequency bands
                if "2412" in phy_info:
                    iface.frequency_bands.append("2.4GHz")
                if "5180" in phy_info:
                    iface.frequency_bands.append("5GHz")

                # Get max TX power
                tx_match = re.search(r"(\d+\.\d+) dBm", phy_info)
                if tx_match:
                    iface.max_tx_power = int(float(tx_match.group(1)))

        return interfaces

    def _check_ap_capability(self, client: paramiko.SSHClient) -> bool:
        """Check if the device can create an access point."""
        # Check for hostapd
        hostapd = self._run_command(client, "which hostapd 2>/dev/null")
        if not hostapd:
            return False

        # Check if any interface supports AP mode
        phy_info = self._run_command(client, "iw phy phy0 info 2>/dev/null")
        return "* AP" in phy_info

    def _check_forwarding(self, client: paramiko.SSHClient) -> bool:
        """Check if IP forwarding is available."""
        forward = self._run_command(
            client, "cat /proc/sys/net/ipv4/ip_forward"
        )
        iptables = self._run_command(client, "which iptables 2>/dev/null")
        return bool(iptables)  # Just needs iptables, forwarding can be enabled

    def _check_mesh_support(self, client: paramiko.SSHClient) -> bool:
        """Check for mesh networking support."""
        # Check for batman-adv
        batman = self._run_command(
            client, "modinfo batman-adv 2>/dev/null | head -1"
        )
        if batman:
            return True

        # Check for 802.11s mesh support
        phy_info = self._run_command(client, "iw phy phy0 info 2>/dev/null")
        return "* mesh point" in phy_info

    def _check_required_tools(self, client: paramiko.SSHClient) -> list[str]:
        """Check which required tools are missing."""
        missing = []
        for tool in self.RELAY_TOOLS:
            result = self._run_command(client, f"which {tool} 2>/dev/null")
            if not result:
                missing.append(tool)
        return missing

    @staticmethod
    def _build_capabilities(report: CompatibilityReport) -> list:
        """Build capability list from compatibility report."""
        caps = [DeviceCapability.STATION_MODE]

        if report.can_create_ap:
            caps.append(DeviceCapability.AP_MODE)
        if report.can_forward_packets:
            caps.append(DeviceCapability.PACKET_FORWARD)
        if report.has_mesh_support:
            caps.append(DeviceCapability.MESH_SUPPORT)

        # Check for dual band
        for iface in report.wifi_interfaces:
            if "2.4GHz" in iface.frequency_bands and "5GHz" in iface.frequency_bands:
                caps.append(DeviceCapability.DUAL_BAND)
                break

        return caps
