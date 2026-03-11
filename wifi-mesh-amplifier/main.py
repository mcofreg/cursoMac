#!/usr/bin/env python3
"""WiFi Mesh Amplifier - Main Entry Point.

Starts the mesh network coordinator and web dashboard
for managing WiFi relay nodes.

Usage:
    python main.py                      # Start with default config
    python main.py --config myconf.yaml # Start with custom config
    python main.py --scan-only          # Only scan, don't start dashboard
"""

import argparse
import logging
import signal
import sys
from pathlib import Path

import yaml

from mesh.coordinator import MeshCoordinator
from dashboard.app import create_app, socketio

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("wifi-mesh-amplifier")


def load_config(config_path: str) -> dict:
    """Load configuration from YAML file."""
    path = Path(config_path)
    if not path.exists():
        logger.warning("Config file not found: %s, using defaults", config_path)
        return {}

    with open(path) as f:
        return yaml.safe_load(f) or {}


def main():
    parser = argparse.ArgumentParser(
        description="WiFi Mesh Amplifier - Extend WiFi coverage using existing devices"
    )
    parser.add_argument(
        "--config", "-c",
        default="config/default_config.yaml",
        help="Path to configuration file",
    )
    parser.add_argument(
        "--scan-only",
        action="store_true",
        help="Only scan for devices, then exit",
    )
    parser.add_argument(
        "--port", "-p",
        type=int, default=None,
        help="Dashboard port (overrides config)",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Enable debug logging",
    )
    args = parser.parse_args()

    if args.debug:
        logging.getLogger().setLevel(logging.DEBUG)

    # Load configuration
    config = load_config(args.config)
    logger.info("WiFi Mesh Amplifier v1.0.0 starting...")

    # Initialize coordinator
    coordinator = MeshCoordinator(config)

    if args.scan_only:
        # Just scan and report
        logger.info("Running scan-only mode...")
        nodes = coordinator.discover_devices()

        print(f"\n{'='*60}")
        print(f"  Network Scan Results")
        print(f"{'='*60}")
        print(f"  Total devices found: {len(coordinator.nodes)}")

        compatible = [n for n in coordinator.nodes.values() if n.is_relay_capable]
        print(f"  Relay-compatible:    {len(compatible)}")
        print(f"{'='*60}\n")

        for node in coordinator.nodes.values():
            status = "COMPATIBLE" if node.is_relay_capable else "---"
            print(
                f"  {node.ip_address:<16} "
                f"{node.hostname:<20} "
                f"{node.device_type.value:<16} "
                f"{node.signal_strength:>4} dBm  "
                f"[{status}]"
            )

        print()
        return

    # Start coordinator
    coordinator.start()

    # Handle graceful shutdown
    def shutdown_handler(signum, frame):
        logger.info("Shutting down...")
        coordinator.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown_handler)
    signal.signal(signal.SIGTERM, shutdown_handler)

    # Start web dashboard
    port = args.port or config.get("dashboard", {}).get("port", 8080)
    app = create_app(coordinator)

    logger.info("Dashboard available at http://localhost:%d", port)

    socketio.run(
        app,
        host="0.0.0.0",
        port=port,
        debug=args.debug,
        allow_unsafe_werkzeug=True,
    )


if __name__ == "__main__":
    main()
