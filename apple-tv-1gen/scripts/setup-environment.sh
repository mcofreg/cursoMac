#!/bin/bash
# =============================================================================
# setup-environment.sh
# Prepara el entorno para compilar el ejecutable booteable del Apple TV 1ra gen
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_DIR/build"
TOOLS_DIR="$PROJECT_DIR/tools"

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# -----------------------------------------------------------------------------
# Verificar sistema operativo
# -----------------------------------------------------------------------------
check_os() {
    if [[ "$(uname -s)" == "Linux" ]]; then
        log_info "Sistema Linux detectado"
        PACKAGE_MANAGER=""
        if command -v apt-get &>/dev/null; then
            PACKAGE_MANAGER="apt"
        elif command -v dnf &>/dev/null; then
            PACKAGE_MANAGER="dnf"
        elif command -v pacman &>/dev/null; then
            PACKAGE_MANAGER="pacman"
        fi
    elif [[ "$(uname -s)" == "Darwin" ]]; then
        log_info "Sistema macOS detectado"
        PACKAGE_MANAGER="brew"
    else
        log_error "Sistema operativo no soportado: $(uname -s)"
        exit 1
    fi
}

# -----------------------------------------------------------------------------
# Instalar dependencias del sistema
# -----------------------------------------------------------------------------
install_dependencies() {
    log_info "Instalando dependencias de compilación..."

    case "$PACKAGE_MANAGER" in
        apt)
            sudo apt-get update
            sudo apt-get install -y \
                build-essential \
                gcc-multilib \
                g++-multilib \
                nasm \
                genisoimage \
                parted \
                dosfstools \
                mtools \
                wget \
                curl \
                git \
                libgmp-dev \
                libmpfr-dev \
                libmpc-dev \
                cpio \
                gzip \
                xz-utils
            ;;
        dnf)
            sudo dnf install -y \
                gcc gcc-c++ \
                glibc-devel.i686 \
                nasm \
                genisoimage \
                parted \
                dosfstools \
                mtools \
                wget curl git \
                gmp-devel mpfr-devel libmpc-devel \
                cpio gzip xz
            ;;
        pacman)
            sudo pacman -Syu --noconfirm \
                base-devel \
                lib32-glibc \
                nasm \
                cdrtools \
                parted \
                dosfstools \
                mtools \
                wget curl git \
                gmp mpfr libmpc \
                cpio gzip xz
            ;;
        brew)
            brew install \
                nasm \
                cdrtools \
                wget curl git \
                gmp mpfr libmpc \
                cpio gzip xz
            ;;
        *)
            log_error "No se detectó gestor de paquetes. Instala manualmente:"
            echo "  gcc, nasm, genisoimage, parted, dosfstools, mtools, wget, cpio, gzip"
            exit 1
            ;;
    esac

    log_info "Dependencias instaladas correctamente"
}

# -----------------------------------------------------------------------------
# Descargar herramientas de cross-compilación Darwin
# -----------------------------------------------------------------------------
setup_darwin_cross() {
    log_info "Configurando herramientas de cross-compilación Darwin..."

    mkdir -p "$TOOLS_DIR/darwin-cross"

    if [[ ! -d "$TOOLS_DIR/darwin-cross/bin" ]]; then
        log_info "Clonando appletv1-linux-bootloader..."
        git clone --depth 1 \
            https://github.com/macbian-admin/appletv1-linux-bootloader.git \
            "$TOOLS_DIR/atv-bootloader" 2>/dev/null || {
                log_warn "No se pudo clonar el repo. Intentando alternativa..."
                git clone --depth 1 \
                    https://github.com/DistroHopper39B/atv-linux-loader.git \
                    "$TOOLS_DIR/atv-bootloader" 2>/dev/null || {
                        log_error "No se pudieron descargar las herramientas del bootloader"
                        log_info "Descárgalas manualmente desde:"
                        echo "  https://github.com/macbian-admin/appletv1-linux-bootloader"
                        echo "  https://github.com/DistroHopper39B/atv-linux-loader"
                        exit 1
                    }
            }

        if [[ -d "$TOOLS_DIR/atv-bootloader/darwin-cross" ]]; then
            cp -r "$TOOLS_DIR/atv-bootloader/darwin-cross/"* "$TOOLS_DIR/darwin-cross/"
            log_info "Herramientas Darwin copiadas a $TOOLS_DIR/darwin-cross/"
        fi
    else
        log_info "Herramientas Darwin ya configuradas"
    fi
}

# -----------------------------------------------------------------------------
# Descargar kernel Linux 32-bit compatible
# -----------------------------------------------------------------------------
download_kernel() {
    log_info "Preparando kernel Linux 32-bit para Apple TV..."

    mkdir -p "$BUILD_DIR/kernel"

    # Buscar un kernel 32-bit precompilado o compilar uno
    # El Apple TV 1ra gen necesita un kernel i686 (32-bit) con soporte EFI
    KERNEL_VERSION="5.10.0"

    if [[ ! -f "$BUILD_DIR/kernel/vmlinuz" ]]; then
        log_info "Descargando kernel Linux $KERNEL_VERSION (i686)..."

        # Intentar obtener kernel de Debian i386
        DEBIAN_MIRROR="https://deb.debian.org/debian"
        KERNEL_PKG="linux-image-${KERNEL_VERSION}-686"

        log_warn "Para obtener un kernel 32-bit compatible, tienes estas opciones:"
        echo ""
        echo "  Opción 1 - Desde una instalación Debian i386:"
        echo "    Copia /boot/vmlinuz-* y /boot/initrd.img-* desde un sistema Debian i386"
        echo ""
        echo "  Opción 2 - Compilar kernel personalizado:"
        echo "    make ARCH=i386 menuconfig  # Usar config/kernel-config como base"
        echo "    make ARCH=i386 -j\$(nproc)"
        echo ""
        echo "  Opción 3 - Usar imagen precompilada de OSMC/Kinos:"
        echo "    Descarga desde https://osmc.tv/download/ (Apple TV 1)"
        echo ""

        log_info "Coloca los archivos del kernel en: $BUILD_DIR/kernel/"
        echo "  - vmlinuz    (kernel Linux 32-bit)"
        echo "  - initrd.gz  (initramfs en formato gzip, NO tar.gz)"
    else
        log_info "Kernel encontrado en $BUILD_DIR/kernel/vmlinuz"
    fi
}

# -----------------------------------------------------------------------------
# Crear estructura de directorios
# -----------------------------------------------------------------------------
create_directories() {
    log_info "Creando estructura de directorios..."
    mkdir -p "$BUILD_DIR"/{kernel,output,usb-image,rootfs}
    mkdir -p "$TOOLS_DIR"
    log_info "Directorios creados en $BUILD_DIR/"
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
main() {
    echo "=============================================="
    echo " Apple TV 1ra Gen - Setup del entorno"
    echo "=============================================="
    echo ""

    check_os
    create_directories

    read -rp "¿Instalar dependencias del sistema? [s/N]: " install_deps
    if [[ "$install_deps" =~ ^[sS]$ ]]; then
        install_dependencies
    fi

    setup_darwin_cross
    download_kernel

    echo ""
    log_info "Entorno configurado. Siguiente paso:"
    echo "  ./scripts/build-mach-kernel.sh"
    echo ""
}

main "$@"
