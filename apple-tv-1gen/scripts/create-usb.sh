#!/bin/bash
# =============================================================================
# create-usb.sh
# Crea un USB booteable para el Apple TV 1ra generación
#
# USO: ./create-usb.sh /dev/sdX
#
# ADVERTENCIA: Este script BORRA todo el contenido del dispositivo USB
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_DIR/build"
OUTPUT_DIR="$BUILD_DIR/output"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step()  { echo -e "${CYAN}[STEP]${NC} $1"; }

# -----------------------------------------------------------------------------
# Verificar argumentos y permisos
# -----------------------------------------------------------------------------
check_args() {
    if [[ $# -lt 1 ]]; then
        echo "Uso: $0 /dev/sdX"
        echo ""
        echo "Dispositivos disponibles:"
        lsblk -d -o NAME,SIZE,TYPE,MOUNTPOINT 2>/dev/null || fdisk -l 2>/dev/null
        exit 1
    fi

    USB_DEVICE="$1"

    # Verificar que el dispositivo existe
    if [[ ! -b "$USB_DEVICE" ]]; then
        log_error "Dispositivo no encontrado: $USB_DEVICE"
        exit 1
    fi

    # Verificar que NO es el disco del sistema
    ROOT_DISK=$(mount | grep " / " | cut -d' ' -f1 | sed 's/[0-9]*$//')
    if [[ "$USB_DEVICE" == "$ROOT_DISK" ]]; then
        log_error "¡El dispositivo seleccionado es el disco del sistema!"
        exit 1
    fi

    # Verificar permisos de root
    if [[ $EUID -ne 0 ]]; then
        log_error "Este script requiere permisos de root"
        echo "  Ejecuta: sudo $0 $USB_DEVICE"
        exit 1
    fi

    # Verificar que mach_kernel existe
    if [[ ! -f "$OUTPUT_DIR/mach_kernel" ]]; then
        log_error "No se encontró mach_kernel en $OUTPUT_DIR/"
        echo "  Ejecuta primero: ./scripts/build-mach-kernel.sh"
        exit 1
    fi
}

# -----------------------------------------------------------------------------
# Confirmar operación destructiva
# -----------------------------------------------------------------------------
confirm_operation() {
    echo ""
    log_warn "ADVERTENCIA: Se borrará TODO el contenido de $USB_DEVICE"
    echo ""
    echo "  Dispositivo: $USB_DEVICE"
    echo "  Tamaño:      $(lsblk -d -n -o SIZE "$USB_DEVICE" 2>/dev/null || echo "desconocido")"
    echo ""
    read -rp "¿Continuar? Escribe 'SI' para confirmar: " confirm
    if [[ "$confirm" != "SI" ]]; then
        log_info "Operación cancelada"
        exit 0
    fi
}

# -----------------------------------------------------------------------------
# Preparar USB con partición GPT + HFS+
# -----------------------------------------------------------------------------
prepare_usb() {
    log_step "Preparando USB..."

    # Desmontar particiones existentes
    umount "${USB_DEVICE}"* 2>/dev/null || true

    # Crear tabla de particiones GPT
    log_info "Creando tabla GPT..."
    parted -s "$USB_DEVICE" mklabel gpt

    # Crear partición EFI (200MB) - necesaria para boot.efi
    log_info "Creando partición EFI (200MB)..."
    parted -s "$USB_DEVICE" mkpart primary fat32 1MiB 201MiB
    parted -s "$USB_DEVICE" set 1 esp on

    # Crear partición de sistema (resto del disco)
    log_info "Creando partición de sistema..."
    parted -s "$USB_DEVICE" mkpart primary ext4 201MiB 100%

    # Esperar a que el kernel detecte las nuevas particiones
    partprobe "$USB_DEVICE" 2>/dev/null || true
    sleep 2

    # Determinar nombres de particiones
    if [[ "$USB_DEVICE" == *"nvme"* ]] || [[ "$USB_DEVICE" == *"mmcblk"* ]]; then
        PART1="${USB_DEVICE}p1"
        PART2="${USB_DEVICE}p2"
    else
        PART1="${USB_DEVICE}1"
        PART2="${USB_DEVICE}2"
    fi

    # Formatear particiones
    log_info "Formateando partición EFI (FAT32)..."
    mkfs.vfat -F 32 -n "ATV-EFI" "$PART1"

    log_info "Formateando partición de sistema (ext4)..."
    mkfs.ext4 -L "ATV-LINUX" "$PART2"
}

# -----------------------------------------------------------------------------
# Copiar archivos al USB
# -----------------------------------------------------------------------------
copy_files() {
    log_step "Copiando archivos al USB..."

    local MOUNT_EFI="/tmp/atv-efi"
    local MOUNT_SYS="/tmp/atv-sys"

    mkdir -p "$MOUNT_EFI" "$MOUNT_SYS"

    # Montar partición EFI
    mount "$PART1" "$MOUNT_EFI"

    # Crear estructura de arranque del Apple TV
    # El Apple TV busca: /mach_kernel en la partición EFI
    mkdir -p "$MOUNT_EFI/System/Library/CoreServices"

    # Copiar mach_kernel
    log_info "Copiando mach_kernel..."
    cp "$OUTPUT_DIR/mach_kernel" "$MOUNT_EFI/mach_kernel"

    # Copiar kernel e initrd por separado (para bootloaders que los buscan así)
    if [[ -f "$BUILD_DIR/kernel/vmlinuz" ]]; then
        cp "$BUILD_DIR/kernel/vmlinuz" "$MOUNT_EFI/vmlinuz"
    fi
    if [[ -f "$BUILD_DIR/kernel/initrd.gz" ]]; then
        cp "$BUILD_DIR/kernel/initrd.gz" "$MOUNT_EFI/initrd.gz"
    fi

    # Crear archivo de información de arranque
    cat > "$MOUNT_EFI/System/Library/CoreServices/SystemVersion.plist" << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>ProductBuildVersion</key>
    <string>ATV-Linux</string>
    <key>ProductName</key>
    <string>Apple TV Linux</string>
    <key>ProductVersion</key>
    <string>1.0</string>
</dict>
</plist>
PLIST

    # Montar partición de sistema
    mount "$PART2" "$MOUNT_SYS"

    # Crear estructura básica para rootfs
    log_info "Preparando partición de sistema..."
    mkdir -p "$MOUNT_SYS"/{boot,etc,home,root,tmp,var}

    # Copiar parámetros de boot
    if [[ -f "$PROJECT_DIR/config/boot-params.conf" ]]; then
        cp "$PROJECT_DIR/config/boot-params.conf" "$MOUNT_SYS/boot/"
    fi

    # Desmontar
    sync
    umount "$MOUNT_EFI"
    umount "$MOUNT_SYS"
    rmdir "$MOUNT_EFI" "$MOUNT_SYS" 2>/dev/null || true

    log_info "Archivos copiados correctamente"
}

# -----------------------------------------------------------------------------
# Mostrar instrucciones finales
# -----------------------------------------------------------------------------
show_instructions() {
    echo ""
    echo "=============================================="
    echo -e " ${GREEN}USB booteable creado exitosamente${NC}"
    echo "=============================================="
    echo ""
    echo " Instrucciones para arrancar:"
    echo ""
    echo "  1. Apaga el Apple TV"
    echo "  2. Conecta el USB al puerto USB del Apple TV"
    echo "  3. Enciende el Apple TV"
    echo "  4. El Apple TV debería arrancar Linux desde el USB"
    echo ""
    echo " Si no arranca automáticamente:"
    echo ""
    echo "  - Asegúrate de que el USB está bien conectado"
    echo "  - Prueba con otro puerto USB"
    echo "  - Verifica que el kernel es 32-bit (i686/i386)"
    echo "  - Revisa la documentación en docs/"
    echo ""
    echo " Para instalar en el disco interno:"
    echo ""
    echo "  Una vez arrancado Linux desde USB, puedes instalar"
    echo "  el sistema al disco interno del Apple TV"
    echo ""
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
main() {
    echo "=============================================="
    echo " Apple TV 1ra Gen - Crear USB booteable"
    echo "=============================================="
    echo ""

    check_args "$@"
    confirm_operation
    prepare_usb
    copy_files
    show_instructions
}

main "$@"
