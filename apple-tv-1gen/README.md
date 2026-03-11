# Apple TV 1ra Generación - Revive tu hardware con Linux

Proyecto para construir un ejecutable booteable que permite instalar Linux moderno
(ligero) en un Apple TV de primera generación (2007), dándole nueva vida como:

- **Media Center** (Kodi/OSMC)
- **Consola retro** (RetroArch)
- **Servidor ligero** (web, DNS, NAS básico)
- **Estación de streaming** (MPV + yt-dlp)

## Especificaciones del hardware

| Componente     | Detalle                                    |
|----------------|--------------------------------------------|
| CPU            | Intel Pentium M "Crofton" 1 GHz (32-bit)  |
| RAM            | 256 MB DDR2 (soldada, no ampliable)        |
| GPU            | Nvidia GeForce Go 7300 (64-128 MB VRAM)   |
| Almacenamiento | HDD IDE 40/160 GB                          |
| Red            | Ethernet 100 Mbps + Wi-Fi (no funciona en Linux) |
| Salida video   | HDMI 720p, Component Video                 |
| Chipset        | Intel 945GUX + ICH7                        |
| Arquitectura   | x86 32-bit (EFI 32-bit)                   |

## Cómo funciona el booteo

El Apple TV 1ra gen solo arranca desde archivos `boot.efi` oficiales de Apple.
El truco consiste en:

1. Compilar un kernel Linux 32-bit (`vmlinuz`) y un initrd (`initrd.gz`)
2. Empaquetarlos en un ejecutable falso de Darwin llamado `mach_kernel`
3. El `boot.efi` original del Apple TV carga este `mach_kernel` pensando que es macOS
4. En realidad arranca Linux

## Requisitos previos

- Apple TV 1ra generación (modelo A1218)
- USB flash drive (mínimo 1 GB)
- Cable HDMI o Component Video
- PC con Linux para compilar (o macOS con Xcode)
- Conexión Ethernet (el Wi-Fi interno no funciona en Linux)
- (Opcional) SSD + adaptador IDE-a-SATA para mejor rendimiento
- (Opcional) Tarjeta Crystal HD para decodificación de video por hardware

## Inicio rápido

```bash
# 1. Clonar este repositorio
git clone <repo-url>
cd apple-tv-1gen

# 2. Descargar kernel y herramientas
./scripts/setup-environment.sh

# 3. Construir el ejecutable mach_kernel
./scripts/build-mach-kernel.sh

# 4. Crear USB booteable
./scripts/create-usb.sh /dev/sdX  # Reemplaza sdX con tu USB

# 5. Conectar USB al Apple TV y encender
# El Apple TV arrancará Linux desde el USB
```

## Estructura del proyecto

```
apple-tv-1gen/
├── README.md                   # Este archivo
├── scripts/
│   ├── setup-environment.sh    # Descarga dependencias y kernel
│   ├── build-mach-kernel.sh    # Construye el ejecutable booteable
│   └── create-usb.sh          # Crea el USB de arranque
├── config/
│   ├── kernel-config           # Configuración del kernel optimizada
│   └── boot-params.conf       # Parámetros de arranque
└── docs/
    ├── HARDWARE-MODS.md       # Modificaciones de hardware recomendadas
    └── SOFTWARE-OPTIONS.md    # Opciones de software disponibles
```

## Mejoras de hardware recomendadas

1. **Reemplazar HDD por SSD**: Usar adaptador IDE-a-SATA con SSD de 2.5"
2. **Instalar Crystal HD**: Reemplazar tarjeta Wi-Fi por decodificador Crystal HD
3. **Pasta térmica**: Reaplicar para mejor disipación

## Recursos externos

- [appletv1-linux-bootloader](https://github.com/macbian-admin/appletv1-linux-bootloader)
- [atv-linux-loader (moderno)](https://github.com/DistroHopper39B/atv-linux-loader)
- [Documentación de boot](https://github.com/macbian-admin/appletv1-boot-documentation)
- [Guía Linux en Apple TV](https://www.tommycoolman.com/2018/10/10/installing-linux-on-the-1st-generation-apple-tv/)
- [Kodi Wiki - Apple TV 1](https://kodi.wiki/view/Archive:HOW-TO:Install_XBMC_on_Apple_TV_1)
- [OSMC en Apple TV 1](https://forums.macrumors.com/threads/osmc-full-linux-desktop-on-1st-gen-appletv.2035280/)

## Licencia

Este proyecto es educativo y se basa en herramientas de código abierto existentes.
