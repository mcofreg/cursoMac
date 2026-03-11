"""Data models for the WiFi Mesh Amplifier system."""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional
import time


class DeviceType(Enum):
    LINUX_EMBEDDED = "linux_embedded"
    OPENWRT = "openwrt"
    ANDROID = "android"
    RASPBERRY_PI = "raspberry_pi"
    IP_CAMERA = "ip_camera"
    UNKNOWN = "unknown"


class DeviceCapability(Enum):
    AP_MODE = "ap_mode"              # Can create access point
    STATION_MODE = "station_mode"    # Can connect as client
    MONITOR_MODE = "monitor_mode"    # Can monitor traffic
    DUAL_BAND = "dual_band"         # Supports 2.4GHz and 5GHz
    MESH_SUPPORT = "mesh_support"    # Native 802.11s mesh
    PACKET_FORWARD = "packet_forward"  # Can forward packets


class NodeStatus(Enum):
    DISCOVERED = "discovered"
    COMPATIBLE = "compatible"
    CONFIGURING = "configuring"
    ACTIVE = "active"
    RELAY_ACTIVE = "relay_active"
    UNREACHABLE = "unreachable"
    INCOMPATIBLE = "incompatible"


@dataclass
class WiFiInterface:
    name: str
    mac_address: str
    driver: str
    supports_ap: bool = False
    supports_mesh: bool = False
    frequency_bands: list = field(default_factory=list)
    max_tx_power: int = 0  # in dBm


@dataclass
class NetworkNode:
    """Represents a device in the mesh network."""
    ip_address: str
    mac_address: str
    hostname: str = ""
    device_type: DeviceType = DeviceType.UNKNOWN
    status: NodeStatus = NodeStatus.DISCOVERED
    signal_strength: int = 0  # dBm
    capabilities: list = field(default_factory=list)
    wifi_interfaces: list = field(default_factory=list)
    connected_clients: int = 0
    bandwidth_usage: float = 0.0  # Mbps
    uptime: float = 0.0
    last_seen: float = field(default_factory=time.time)
    parent_node: Optional[str] = None  # MAC of upstream node
    child_nodes: list = field(default_factory=list)

    @property
    def is_relay_capable(self) -> bool:
        return (
            DeviceCapability.AP_MODE in self.capabilities
            and DeviceCapability.STATION_MODE in self.capabilities
            and DeviceCapability.PACKET_FORWARD in self.capabilities
        )

    @property
    def is_active(self) -> bool:
        return self.status in (NodeStatus.ACTIVE, NodeStatus.RELAY_ACTIVE)


@dataclass
class MeshRoute:
    """Represents a route in the mesh network."""
    source_mac: str
    destination_mac: str
    next_hop_mac: str
    hop_count: int
    metric: float  # Lower is better
    last_updated: float = field(default_factory=time.time)


@dataclass
class MeshNetworkStats:
    """Statistics for the entire mesh network."""
    total_nodes: int = 0
    active_relays: int = 0
    total_clients: int = 0
    average_signal: float = 0.0
    total_bandwidth: float = 0.0
    coverage_area_estimate: float = 0.0  # square meters
    uptime: float = 0.0
