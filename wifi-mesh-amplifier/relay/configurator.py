"""Device configurator for setting up WiFi relay functionality.

Connects to compatible devices via SSH and configures them
to act as WiFi repeaters/relay nodes in the mesh network.
"""

import logging
import textwrap

import paramiko

from core.models import NetworkNode, DeviceType, NodeStatus

logger = logging.getLogger(__name__)


class RelayConfigurator:
    """Configures devices to operate as WiFi relay nodes."""

    def __init__(
        self,
        mesh_ssid: str = "MeshAmplifier",
        channel: int = 6,
        security: str = "WPA2",
        ssh_username: str = "root",
        ssh_key_path: str = None,
    ):
        self.mesh_ssid = mesh_ssid
        self.channel = channel
        self.security = security
        self.ssh_username = ssh_username
        self.ssh_key_path = ssh_key_path

    def configure_relay(
        self, node: NetworkNode, upstream_ssid: str, upstream_password: str,
        relay_password: str
    ) -> bool:
        """Configure a device as a WiFi relay node.

        The device will:
        1. Connect to the upstream WiFi as a client
        2. Create its own AP for downstream clients
        3. Bridge/NAT traffic between the two interfaces
        """
        logger.info("Configuring relay on %s (%s)",
                     node.ip_address, node.hostname)
        node.status = NodeStatus.CONFIGURING

        try:
            client = self._connect(node.ip_address)
            if not client:
                logger.error("Cannot connect to %s", node.ip_address)
                return False

            # Step 1: Detect WiFi interface configuration
            wifi_info = self._detect_wifi_setup(client)
            if not wifi_info:
                logger.error("No suitable WiFi setup found on %s",
                             node.ip_address)
                return False

            primary_iface = wifi_info["primary"]
            ap_iface = wifi_info.get("secondary", f"{primary_iface}_ap")

            # Step 2: Create virtual AP interface if needed
            if "secondary" not in wifi_info:
                self._create_virtual_interface(client, primary_iface, ap_iface)

            # Step 3: Configure wpa_supplicant for upstream connection
            self._configure_upstream(
                client, primary_iface, upstream_ssid, upstream_password
            )

            # Step 4: Configure hostapd for AP
            relay_ssid = f"{self.mesh_ssid}_{node.hostname[-6:]}"
            self._configure_ap(
                client, ap_iface, relay_ssid, relay_password
            )

            # Step 5: Configure NAT/bridging
            self._configure_network_bridge(client, primary_iface, ap_iface)

            # Step 6: Enable and start services
            self._start_services(client, node.device_type)

            node.status = NodeStatus.RELAY_ACTIVE
            logger.info("Relay configured successfully on %s",
                         node.ip_address)

            client.close()
            return True

        except Exception as e:
            logger.error("Failed to configure relay on %s: %s",
                         node.ip_address, e)
            node.status = NodeStatus.COMPATIBLE
            return False

    def _connect(self, ip: str):
        """Establish SSH connection."""
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
            kwargs = {
                "hostname": ip,
                "username": self.ssh_username,
                "timeout": 10,
            }
            if self.ssh_key_path:
                kwargs["key_filename"] = self.ssh_key_path
            else:
                kwargs["look_for_keys"] = True
            client.connect(**kwargs)
            return client
        except Exception as e:
            logger.error("SSH connection failed to %s: %s", ip, e)
            return None

    def _run(self, client: paramiko.SSHClient, cmd: str) -> str:
        _, stdout, stderr = client.exec_command(cmd, timeout=30)
        out = stdout.read().decode("utf-8", errors="replace").strip()
        err = stderr.read().decode("utf-8", errors="replace").strip()
        if err:
            logger.debug("stderr: %s", err)
        return out

    def _detect_wifi_setup(self, client) -> dict:
        """Detect available WiFi interfaces and their configuration."""
        output = self._run(client, "iw dev 2>/dev/null")
        interfaces = []

        for line in output.splitlines():
            line = line.strip()
            if line.startswith("Interface"):
                interfaces.append(line.split()[-1])

        if not interfaces:
            return {}

        result = {"primary": interfaces[0]}
        if len(interfaces) > 1:
            result["secondary"] = interfaces[1]

        return result

    def _create_virtual_interface(
        self, client, physical_iface: str, virtual_iface: str
    ):
        """Create a virtual WiFi interface for AP mode."""
        logger.info("Creating virtual interface %s from %s",
                     virtual_iface, physical_iface)

        commands = [
            f"iw dev {physical_iface} interface add {virtual_iface} type __ap",
            f"ip link set {virtual_iface} up",
        ]
        for cmd in commands:
            self._run(client, cmd)

    def _configure_upstream(
        self, client, iface: str, ssid: str, password: str
    ):
        """Configure wpa_supplicant for upstream WiFi connection."""
        config = textwrap.dedent(f"""\
            ctrl_interface=/var/run/wpa_supplicant
            update_config=1

            network={{{{
                ssid="{ssid}"
                psk="{password}"
                key_mgmt=WPA-PSK
                priority=1
            }}}}
        """)

        self._run(
            client,
            f"cat > /etc/wpa_supplicant/wpa_supplicant-{iface}.conf << 'WPEOF'\n"
            f"{config}\nWPEOF"
        )

    def _configure_ap(
        self, client, iface: str, ssid: str, password: str
    ):
        """Configure hostapd for the relay access point."""
        config = textwrap.dedent(f"""\
            interface={iface}
            driver=nl80211
            ssid={ssid}
            hw_mode=g
            channel={self.channel}
            wmm_enabled=0
            macaddr_acl=0
            auth_algs=1
            ignore_broadcast_ssid=0
            wpa=2
            wpa_passphrase={password}
            wpa_key_mgmt=WPA-PSK
            wpa_pairwise=TKIP
            rsn_pairwise=CCMP
        """)

        self._run(
            client,
            f"cat > /etc/hostapd/hostapd-relay.conf << 'HAPEOF'\n"
            f"{config}\nHAPEOF"
        )

    def _configure_network_bridge(
        self, client, upstream_iface: str, ap_iface: str
    ):
        """Set up NAT between upstream and AP interfaces."""
        commands = [
            # Enable IP forwarding
            "sysctl -w net.ipv4.ip_forward=1",
            "echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf",

            # Configure AP interface with static IP
            f"ip addr add 192.168.50.1/24 dev {ap_iface} 2>/dev/null || true",

            # Set up NAT with iptables
            f"iptables -t nat -A POSTROUTING -o {upstream_iface} -j MASQUERADE",
            f"iptables -A FORWARD -i {ap_iface} -o {upstream_iface}"
            " -m state --state RELATED,ESTABLISHED -j ACCEPT",
            f"iptables -A FORWARD -i {upstream_iface} -o {ap_iface} -j ACCEPT",
        ]

        for cmd in commands:
            self._run(client, cmd)

        # Configure dnsmasq for DHCP on the AP interface
        dnsmasq_config = textwrap.dedent(f"""\
            interface={ap_iface}
            dhcp-range=192.168.50.10,192.168.50.200,255.255.255.0,24h
            bind-interfaces
            server=8.8.8.8
            domain-needed
            bogus-priv
        """)

        self._run(
            client,
            f"cat > /etc/dnsmasq.d/mesh-relay.conf << 'DNSEOF'\n"
            f"{dnsmasq_config}\nDNSEOF"
        )

    def _start_services(self, client, device_type: DeviceType):
        """Start all relay services."""
        if device_type == DeviceType.OPENWRT:
            commands = [
                "/etc/init.d/hostapd restart",
                "/etc/init.d/dnsmasq restart",
            ]
        else:
            commands = [
                "systemctl restart wpa_supplicant 2>/dev/null || "
                "wpa_supplicant -B -i wlan0 -c /etc/wpa_supplicant/wpa_supplicant-wlan0.conf",
                "hostapd -B /etc/hostapd/hostapd-relay.conf",
                "systemctl restart dnsmasq 2>/dev/null || "
                "dnsmasq --conf-file=/etc/dnsmasq.d/mesh-relay.conf",
            ]

        for cmd in commands:
            result = self._run(client, cmd)
            logger.debug("Service command result: %s", result)

    def deconfigure_relay(self, node: NetworkNode) -> bool:
        """Remove relay configuration from a device."""
        try:
            client = self._connect(node.ip_address)
            if not client:
                return False

            commands = [
                "killall hostapd 2>/dev/null || true",
                "iptables -t nat -F",
                "iptables -F FORWARD",
                "rm -f /etc/hostapd/hostapd-relay.conf",
                "rm -f /etc/dnsmasq.d/mesh-relay.conf",
                "sysctl -w net.ipv4.ip_forward=0",
            ]

            for cmd in commands:
                self._run(client, cmd)

            node.status = NodeStatus.COMPATIBLE
            client.close()
            return True

        except Exception as e:
            logger.error("Failed to deconfigure %s: %s",
                         node.ip_address, e)
            return False
