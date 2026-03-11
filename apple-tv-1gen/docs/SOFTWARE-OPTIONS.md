# Opciones de Software - Apple TV 1ra Generación

## Comparativa de opciones

| Opción         | Dificultad | Uso principal        | Estado    |
|----------------|------------|----------------------|-----------|
| OSMC           | Fácil      | Media Center (Kodi)  | Activo    |
| Kinos2         | Fácil      | Kodi + RetroArch     | Archivo   |
| Debian Linux   | Media      | Servidor / General   | Viable    |
| Ubuntu 12.04   | Media      | Escritorio ligero    | Obsoleto  |
| Kernel custom  | Alta       | Cualquier uso        | Viable    |

## 1. OSMC (Recomendado para principiantes)

**Sitio**: https://osmc.tv

OSMC es una distribución Linux basada en Debian que incluye Kodi preinstalado
y optimizado para hardware limitado.

### Ventajas
- Instalador fácil
- Kodi preconfigurado
- Actualizaciones automáticas
- Comunidad activa
- Puede instalar escritorio Linux (LXDE/MATE)

### Instalación
1. Descargar instalador OSMC para Apple TV 1
2. Crear USB booteable con el instalador
3. Conectar USB al Apple TV y encender
4. Seguir instrucciones en pantalla

## 2. Kinos2 (Media Center + Retro Gaming)

Imagen preconfigurada con Kodi Jarvis 16.1 y RetroArch.
Basada en Ubuntu 12.04 (CrystalBuntu).

### Ventajas
- Plug and play
- RetroArch incluido para emulación retro
- Soporte Crystal HD integrado

### Desventajas
- Basada en Ubuntu 12.04 (sin soporte)
- Paquetes desactualizados
- Difícil de encontrar (recursos archivados)

## 3. Debian Linux (Recomendado para servidores)

Instalación limpia de Debian i386 (Stretch o Buster).

### Usos posibles
- Servidor web ligero (nginx)
- Pi-hole / DNS ad-blocker
- NAS básico (Samba)
- Servidor de medios (minidlna)
- Home automation (Home Assistant en modo limitado)
- Monitor de red

### Consideraciones
- Usar Debian Buster (10) o Stretch (9) para compatibilidad 32-bit
- Versiones más nuevas han eliminado soporte i386 para algunos paquetes
- Configurar swap agresivo (256 MB RAM es muy limitado)
- Usar gestores de ventanas ultraligeros si necesitas GUI (dwm, i3, openbox)

## 4. Kernel personalizado

Para máximo control, puedes compilar tu propio kernel Linux
usando la configuración incluida en `config/kernel-config`.

### Cuándo usarlo
- Necesitas drivers específicos
- Quieres optimizar para el hardware exacto
- Los kernels precompilados no arrancan

### Proceso
```bash
# Descargar fuentes del kernel
wget https://cdn.kernel.org/pub/linux/kernel/v5.x/linux-5.10.tar.xz

# Extraer y configurar
tar xf linux-5.10.tar.xz
cd linux-5.10
cp /path/to/config/kernel-config .config
make ARCH=i386 olddefconfig
make ARCH=i386 menuconfig  # Ajustar si es necesario
make ARCH=i386 -j$(nproc)

# El kernel estará en arch/x86/boot/bzImage
cp arch/x86/boot/bzImage /path/to/build/kernel/vmlinuz
```

## 5. Software recomendado para 256 MB RAM

### Media
- **mpv** - Reproductor de video ligero
- **yt-dlp** - Descarga/streaming de YouTube (solo audio funciona bien)
- **cmus** - Reproductor de música en terminal

### Servidor
- **nginx** - Servidor web (mucho más ligero que Apache)
- **dnsmasq** - DNS/DHCP ligero
- **dropbear** - SSH server ultraligero (alternativa a OpenSSH)

### Sistema
- **busybox** - Herramientas Unix en un solo binario
- **tmux** - Multiplexor de terminal
- **htop** - Monitor de sistema

### GUI (si es necesario)
- **dwm** - Window manager en ~2000 líneas de C
- **st** - Terminal simple
- **surf** - Navegador web mínimo (webkit)
