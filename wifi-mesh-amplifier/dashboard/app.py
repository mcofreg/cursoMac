"""Web dashboard for WiFi Mesh Amplifier.

Provides a real-time web interface to monitor and control
the mesh network, view device status, and manage relays.
"""

import logging
from flask import Flask, render_template_string, jsonify, request
from flask_socketio import SocketIO

from mesh.coordinator import MeshCoordinator

logger = logging.getLogger(__name__)

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

coordinator: MeshCoordinator = None

DASHBOARD_HTML = """\
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WiFi Mesh Amplifier - Dashboard</title>
    <script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #0a0e27;
            color: #e0e0e0;
            min-height: 100vh;
        }
        .header {
            background: linear-gradient(135deg, #1a1f4e, #2d1b69);
            padding: 20px 30px;
            border-bottom: 2px solid #3a3f8f;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .header h1 { font-size: 1.5em; color: #00d4ff; }
        .header .status {
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 0.9em;
            font-weight: bold;
        }
        .status-active { background: #00c85320; color: #00c853; border: 1px solid #00c853; }
        .status-inactive { background: #ff525220; color: #ff5252; border: 1px solid #ff5252; }

        .dashboard { padding: 20px 30px; }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin-bottom: 24px;
        }
        .stat-card {
            background: #12163a;
            border: 1px solid #2a2f5f;
            border-radius: 12px;
            padding: 20px;
            text-align: center;
        }
        .stat-card .value {
            font-size: 2em;
            font-weight: bold;
            color: #00d4ff;
        }
        .stat-card .label {
            font-size: 0.85em;
            color: #8888aa;
            margin-top: 4px;
        }

        .section {
            background: #12163a;
            border: 1px solid #2a2f5f;
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 20px;
        }
        .section h2 {
            color: #00d4ff;
            margin-bottom: 16px;
            font-size: 1.2em;
        }

        table {
            width: 100%;
            border-collapse: collapse;
        }
        th {
            text-align: left;
            padding: 10px 12px;
            background: #1a1f4e;
            color: #8888cc;
            font-size: 0.85em;
            text-transform: uppercase;
        }
        td {
            padding: 10px 12px;
            border-bottom: 1px solid #1a1f4e;
        }
        tr:hover { background: #1a1f4e40; }

        .badge {
            display: inline-block;
            padding: 3px 10px;
            border-radius: 12px;
            font-size: 0.8em;
            font-weight: bold;
        }
        .badge-active { background: #00c85320; color: #00c853; }
        .badge-relay { background: #00d4ff20; color: #00d4ff; }
        .badge-compatible { background: #ffab0020; color: #ffab00; }
        .badge-offline { background: #ff525220; color: #ff5252; }
        .badge-unknown { background: #88888820; color: #888888; }

        .signal-bar {
            display: inline-block;
            width: 60px;
            height: 8px;
            background: #1a1f4e;
            border-radius: 4px;
            overflow: hidden;
        }
        .signal-bar .fill {
            height: 100%;
            border-radius: 4px;
            transition: width 0.3s;
        }
        .signal-excellent .fill { background: #00c853; }
        .signal-good .fill { background: #7cb342; }
        .signal-fair .fill { background: #ffab00; }
        .signal-poor .fill { background: #ff5252; }

        .btn {
            padding: 6px 14px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 0.85em;
            font-weight: bold;
            transition: opacity 0.2s;
        }
        .btn:hover { opacity: 0.8; }
        .btn-activate { background: #00c853; color: white; }
        .btn-deactivate { background: #ff5252; color: white; }
        .btn-scan { background: #00d4ff; color: #0a0e27; }

        .controls { margin-bottom: 20px; display: flex; gap: 10px; }

        .topology-container {
            background: #0d1030;
            border-radius: 8px;
            padding: 20px;
            min-height: 300px;
            position: relative;
        }
        .topo-node {
            position: absolute;
            text-align: center;
            cursor: pointer;
        }
        .topo-node .icon {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 4px;
            font-size: 1.2em;
        }
        .topo-node .name {
            font-size: 0.75em;
            color: #8888aa;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>&#x1F4F6; WiFi Mesh Amplifier</h1>
        <span class="status status-active" id="systemStatus">Sistema Activo</span>
    </div>

    <div class="dashboard">
        <div class="stats-grid">
            <div class="stat-card">
                <div class="value" id="totalNodes">0</div>
                <div class="label">Dispositivos Detectados</div>
            </div>
            <div class="stat-card">
                <div class="value" id="activeRelays">0</div>
                <div class="label">Relays Activos</div>
            </div>
            <div class="stat-card">
                <div class="value" id="totalClients">0</div>
                <div class="label">Clientes Conectados</div>
            </div>
            <div class="stat-card">
                <div class="value" id="avgSignal">0</div>
                <div class="label">Senal Promedio (dBm)</div>
            </div>
            <div class="stat-card">
                <div class="value" id="totalBandwidth">0</div>
                <div class="label">Ancho de Banda (Mbps)</div>
            </div>
            <div class="stat-card">
                <div class="value" id="coverage">0</div>
                <div class="label">Cobertura Estimada (m2)</div>
            </div>
        </div>

        <div class="controls">
            <button class="btn btn-scan" onclick="scanNetwork()">
                Escanear Red
            </button>
        </div>

        <div class="section">
            <h2>Dispositivos en la Red</h2>
            <table>
                <thead>
                    <tr>
                        <th>Dispositivo</th>
                        <th>IP</th>
                        <th>Tipo</th>
                        <th>Estado</th>
                        <th>Senal</th>
                        <th>Clientes</th>
                        <th>Ancho de Banda</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody id="devicesTable"></tbody>
            </table>
        </div>

        <div class="section">
            <h2>Topologia de Red</h2>
            <div class="topology-container" id="topologyMap"></div>
        </div>
    </div>

    <script>
        const socket = io();

        socket.on('stats_update', (data) => {
            document.getElementById('totalNodes').textContent = data.total_nodes;
            document.getElementById('activeRelays').textContent = data.active_relays;
            document.getElementById('totalClients').textContent = data.total_clients;
            document.getElementById('avgSignal').textContent = Math.round(data.average_signal);
            document.getElementById('totalBandwidth').textContent = data.total_bandwidth.toFixed(1);
            document.getElementById('coverage').textContent = Math.round(data.coverage_area_estimate);
        });

        socket.on('topology_update', (data) => {
            updateDevicesTable(data.nodes);
            updateTopologyMap(data);
        });

        function getSignalClass(signal) {
            if (signal >= -50) return 'signal-excellent';
            if (signal >= -60) return 'signal-good';
            if (signal >= -70) return 'signal-fair';
            return 'signal-poor';
        }

        function getSignalPercent(signal) {
            return Math.max(0, Math.min(100, (signal + 100) * 2));
        }

        function getStatusBadge(status) {
            const map = {
                'relay_active': ['badge-relay', 'Relay Activo'],
                'active': ['badge-active', 'Activo'],
                'compatible': ['badge-compatible', 'Compatible'],
                'unreachable': ['badge-offline', 'Sin Conexion'],
                'incompatible': ['badge-unknown', 'Incompatible'],
                'discovered': ['badge-compatible', 'Descubierto'],
                'configuring': ['badge-compatible', 'Configurando'],
            };
            const [cls, label] = map[status] || ['badge-unknown', status];
            return `<span class="badge ${cls}">${label}</span>`;
        }

        function updateDevicesTable(nodes) {
            const tbody = document.getElementById('devicesTable');
            tbody.innerHTML = nodes.map(node => {
                const signalClass = getSignalClass(node.signal);
                const signalPct = getSignalPercent(node.signal);
                const canActivate = node.status === 'compatible' || node.status === 'discovered';
                const canDeactivate = node.status === 'relay_active';

                return `<tr>
                    <td><strong>${node.label}</strong><br><small>${node.id}</small></td>
                    <td>${node.ip}</td>
                    <td>${node.type}</td>
                    <td>${getStatusBadge(node.status)}</td>
                    <td>
                        <div class="signal-bar ${signalClass}">
                            <div class="fill" style="width:${signalPct}%"></div>
                        </div>
                        <small>${node.signal} dBm</small>
                    </td>
                    <td>${node.clients}</td>
                    <td>${(node.bandwidth || 0).toFixed(1)} Mbps</td>
                    <td>
                        ${canActivate
                            ? `<button class="btn btn-activate" onclick="activateRelay('${node.id}')">Activar</button>`
                            : ''}
                        ${canDeactivate
                            ? `<button class="btn btn-deactivate" onclick="deactivateRelay('${node.id}')">Desactivar</button>`
                            : ''}
                    </td>
                </tr>`;
            }).join('');
        }

        function updateTopologyMap(data) {
            const container = document.getElementById('topologyMap');
            const w = container.clientWidth;
            const h = container.clientHeight || 300;

            container.innerHTML = '';

            // Draw SVG links first
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.style.position = 'absolute';
            svg.style.top = '0';
            svg.style.left = '0';
            svg.style.width = '100%';
            svg.style.height = '100%';
            container.appendChild(svg);

            // Position nodes in a circle
            const cx = w / 2, cy = h / 2;
            const radius = Math.min(w, h) * 0.35;
            const positions = {};

            data.nodes.forEach((node, i) => {
                const angle = (2 * Math.PI * i) / data.nodes.length - Math.PI / 2;
                const x = cx + radius * Math.cos(angle);
                const y = cy + radius * Math.sin(angle);
                positions[node.id] = { x, y };

                const colors = {
                    relay_active: '#00d4ff',
                    active: '#00c853',
                    compatible: '#ffab00',
                };
                const color = colors[node.status] || '#555';

                const el = document.createElement('div');
                el.className = 'topo-node';
                el.style.left = (x - 25) + 'px';
                el.style.top = (y - 25) + 'px';
                el.innerHTML = `
                    <div class="icon" style="border:2px solid ${color}; background:${color}20">
                        ${node.type === 'ip_camera' ? '&#x1F4F7;' :
                          node.type === 'raspberry_pi' ? '&#x1F4BB;' :
                          node.type === 'openwrt' ? '&#x1F4E1;' : '&#x1F4F1;'}
                    </div>
                    <div class="name">${node.label}</div>`;
                container.appendChild(el);
            });

            // Draw links
            data.links.forEach(link => {
                const s = positions[link.source];
                const t = positions[link.target];
                if (s && t) {
                    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                    line.setAttribute('x1', s.x);
                    line.setAttribute('y1', s.y);
                    line.setAttribute('x2', t.x);
                    line.setAttribute('y2', t.y);
                    line.setAttribute('stroke', '#3a3f8f');
                    line.setAttribute('stroke-width', '2');
                    line.setAttribute('stroke-dasharray', '5,5');
                    svg.appendChild(line);
                }
            });
        }

        function scanNetwork() {
            fetch('/api/scan', { method: 'POST' })
                .then(r => r.json())
                .then(data => {
                    console.log('Scan result:', data);
                });
        }

        function activateRelay(mac) {
            const password = prompt('Contrasena del WiFi upstream:');
            if (!password) return;
            const relayPass = prompt('Contrasena para el relay AP:', 'mesh12345');
            if (!relayPass) return;

            fetch('/api/relay/activate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mac: mac,
                    upstream_password: password,
                    relay_password: relayPass,
                }),
            })
            .then(r => r.json())
            .then(data => {
                alert(data.success ? 'Relay activado' : 'Error: ' + data.error);
            });
        }

        function deactivateRelay(mac) {
            if (!confirm('Desactivar este relay?')) return;
            fetch('/api/relay/deactivate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mac: mac }),
            })
            .then(r => r.json())
            .then(data => {
                alert(data.success ? 'Relay desactivado' : 'Error: ' + data.error);
            });
        }

        // Request initial data
        socket.emit('request_update');

        // Periodic refresh
        setInterval(() => socket.emit('request_update'), 5000);
    </script>
</body>
</html>
"""


def create_app(mesh_coordinator: MeshCoordinator) -> Flask:
    """Create and configure the Flask dashboard app."""
    global coordinator
    coordinator = mesh_coordinator

    @app.route("/")
    def index():
        return render_template_string(DASHBOARD_HTML)

    @app.route("/api/stats")
    def api_stats():
        stats = coordinator.get_network_stats()
        return jsonify({
            "total_nodes": stats.total_nodes,
            "active_relays": stats.active_relays,
            "total_clients": stats.total_clients,
            "average_signal": stats.average_signal,
            "total_bandwidth": stats.total_bandwidth,
            "coverage_area_estimate": stats.coverage_area_estimate,
        })

    @app.route("/api/topology")
    def api_topology():
        return jsonify(coordinator.get_topology())

    @app.route("/api/devices")
    def api_devices():
        nodes = []
        for node in coordinator.nodes.values():
            nodes.append({
                "mac": node.mac_address,
                "ip": node.ip_address,
                "hostname": node.hostname,
                "type": node.device_type.value,
                "status": node.status.value,
                "signal": node.signal_strength,
                "clients": node.connected_clients,
                "bandwidth": node.bandwidth_usage,
                "relay_capable": node.is_relay_capable,
            })
        return jsonify(nodes)

    @app.route("/api/scan", methods=["POST"])
    def api_scan():
        new_nodes = coordinator.discover_devices()
        return jsonify({
            "new_devices": len(new_nodes),
            "total_devices": len(coordinator.nodes),
        })

    @app.route("/api/relay/activate", methods=["POST"])
    def api_activate_relay():
        data = request.get_json()
        mac = data.get("mac")
        upstream_password = data.get("upstream_password")
        relay_password = data.get("relay_password", "mesh12345")

        # Get upstream SSID from coordinator config
        upstream_ssid = coordinator.config.get("network", {}).get(
            "upstream_ssid", ""
        )

        success = coordinator.activate_relay(
            mac, upstream_ssid, upstream_password, relay_password
        )
        if success:
            return jsonify({"success": True})
        return jsonify({"success": False, "error": "Failed to activate relay"})

    @app.route("/api/relay/deactivate", methods=["POST"])
    def api_deactivate_relay():
        data = request.get_json()
        mac = data.get("mac")
        success = coordinator.deactivate_relay(mac)
        if success:
            return jsonify({"success": True})
        return jsonify({"success": False, "error": "Failed to deactivate relay"})

    @socketio.on("request_update")
    def handle_update_request():
        stats = coordinator.get_network_stats()
        socketio.emit("stats_update", {
            "total_nodes": stats.total_nodes,
            "active_relays": stats.active_relays,
            "total_clients": stats.total_clients,
            "average_signal": stats.average_signal,
            "total_bandwidth": stats.total_bandwidth,
            "coverage_area_estimate": stats.coverage_area_estimate,
        })
        socketio.emit("topology_update", coordinator.get_topology())

    return app
