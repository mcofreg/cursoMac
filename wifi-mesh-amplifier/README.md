# WiFi Mesh Amplifier

Sistema para extender la cobertura WiFi utilizando dispositivos existentes en tu red (camaras IP, Raspberry Pi, routers OpenWrt, dispositivos Linux) como nodos relay/repetidores en una red mesh.

## Concepto

Este software **no amplifica la potencia de la senal de radio** (eso requiere hardware). Lo que hace es:

1. **Descubrir** dispositivos compatibles en tu red local
2. **Configurarlos** como repetidores WiFi (crean su propio punto de acceso)
3. **Coordinar** una red mesh donde los dispositivos retransmiten el trafico
4. **Auto-reparar** la red cuando un nodo falla, redirigiendo el trafico

```
[Router Principal] ----wifi----> [Camara IP como Relay] ----wifi----> [Dispositivos lejanos]
                   ----wifi----> [Raspberry Pi Relay]   ----wifi----> [Mas dispositivos]
```

## Dispositivos Compatibles

| Tipo | Compatibilidad | Requisitos |
|------|---------------|------------|
| Raspberry Pi | Alta | SSH habilitado, hostapd |
| Routers OpenWrt | Alta | Acceso SSH |
| Camaras IP (Linux) | Media | SSH habilitado, driver WiFi compatible |
| Dispositivos Linux | Media | SSH, iw, hostapd, iptables |
| Android (root) | Baja | Root + ADB habilitado |

## Requisitos del Sistema

- Python 3.10+
- Linux (el coordinador debe ejecutarse en Linux)
- Acceso root/sudo en los dispositivos relay
- Dispositivos con WiFi que soporten modo AP + Station simultaneo

## Instalacion

```bash
cd wifi-mesh-amplifier
pip install -r requirements.txt
```

## Uso

### Escanear la red (solo deteccion)
```bash
python main.py --scan-only
```

### Iniciar el sistema completo con dashboard
```bash
python main.py
```

### Con configuracion personalizada
```bash
python main.py --config mi_config.yaml --port 9090
```

### Opciones
```
--config, -c    Archivo de configuracion YAML
--scan-only     Solo escanear dispositivos, no iniciar dashboard
--port, -p      Puerto del dashboard web
--debug         Habilitar logs detallados
```

## Dashboard Web

Accede a `http://localhost:8080` para:

- Ver todos los dispositivos detectados
- Activar/desactivar nodos relay
- Monitorear senal, ancho de banda y clientes
- Visualizar la topologia de red en tiempo real

## Arquitectura

```
wifi-mesh-amplifier/
├── main.py                 # Punto de entrada
├── core/
│   └── models.py           # Modelos de datos (Node, Route, Stats)
├── discovery/
│   ├── scanner.py          # Escaneo ARP/ping de la red
│   └── compatibility.py    # Verificacion de compatibilidad via SSH
├── relay/
│   ├── configurator.py     # Configura hostapd, NAT, dnsmasq en dispositivos
│   └── monitor.py          # Monitoreo de salud de nodos relay
├── mesh/
│   └── coordinator.py      # Coordinador central de la red mesh
├── dashboard/
│   └── app.py              # Dashboard web Flask + SocketIO
└── config/
    └── default_config.yaml # Configuracion por defecto
```

## Limitaciones Importantes

1. **No es amplificacion de senal RF** - El software extiende cobertura creando puntos de acceso adicionales, no aumenta la potencia de transmision
2. **Requiere acceso SSH** - Los dispositivos deben permitir conexion SSH para ser configurados
3. **No es universal** - Dispositivos sin acceso al OS (cerrados/propietarios) no son compatibles
4. **Latencia** - Cada salto en la red mesh agrega latencia (~2-5ms por salto)
5. **Ancho de banda** - Se reduce aproximadamente a la mitad en cada salto relay

## Configuracion

Edita `config/default_config.yaml` para personalizar:

- Rango de red a escanear
- Canal WiFi y seguridad
- Protocolo de enrutamiento mesh
- Intervalos de monitoreo
- Puerto del dashboard
