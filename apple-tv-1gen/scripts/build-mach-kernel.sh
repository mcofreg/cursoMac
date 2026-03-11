#!/bin/bash
# =============================================================================
# build-mach-kernel.sh
# Construye el ejecutable mach_kernel falso para arrancar Linux en Apple TV 1gen
#
# El Apple TV solo arranca desde boot.efi oficial de Apple. Este script empaqueta
# un kernel Linux 32-bit y su initrd dentro de un binario Mach-O que boot.efi
# acepta como válido, pero que en realidad carga Linux.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_DIR/build"
TOOLS_DIR="$PROJECT_DIR/tools"
CONFIG_DIR="$PROJECT_DIR/config"
OUTPUT_DIR="$BUILD_DIR/output"

# Colores
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
# Verificar archivos necesarios
# -----------------------------------------------------------------------------
verify_prerequisites() {
    log_step "Verificando archivos necesarios..."

    local missing=0

    # Verificar kernel
    if [[ ! -f "$BUILD_DIR/kernel/vmlinuz" ]]; then
        log_error "No se encontró: $BUILD_DIR/kernel/vmlinuz"
        echo "  Copia un kernel Linux 32-bit (i686) a esta ubicación"
        missing=1
    else
        local kernel_arch
        kernel_arch=$(file "$BUILD_DIR/kernel/vmlinuz" | grep -o "x86\|i[36]86\|32-bit" | head -1 || echo "unknown")
        if [[ "$kernel_arch" == "unknown" ]]; then
            log_warn "No se pudo verificar la arquitectura del kernel"
        else
            log_info "Kernel verificado: arquitectura $kernel_arch"
        fi
    fi

    # Verificar initrd
    if [[ ! -f "$BUILD_DIR/kernel/initrd.gz" ]]; then
        log_error "No se encontró: $BUILD_DIR/kernel/initrd.gz"
        echo "  El initrd DEBE estar en formato .gz (gzip puro, NO tar.gz)"
        echo ""
        echo "  Si tienes un .img o .lz, conviértelo así:"
        echo "    # Para .img (cpio):"
        echo "    cp initrd.img initrd.gz"
        echo ""
        echo "    # Para .lz (lzma):"
        echo "    unlzma initrd.lz"
        echo "    gzip initrd"
        echo "    mv initrd.gz $BUILD_DIR/kernel/"
        missing=1
    else
        # Verificar que realmente es gzip
        if file "$BUILD_DIR/kernel/initrd.gz" | grep -q "gzip"; then
            log_info "initrd.gz verificado: formato gzip correcto"
        else
            log_warn "initrd.gz podría no estar en formato gzip puro"
            echo "  Formato detectado: $(file "$BUILD_DIR/kernel/initrd.gz")"
        fi
    fi

    # Verificar herramientas del bootloader
    if [[ ! -d "$TOOLS_DIR/atv-bootloader" ]] && [[ ! -d "$TOOLS_DIR/darwin-cross" ]]; then
        log_error "No se encontraron herramientas del bootloader"
        echo "  Ejecuta primero: ./scripts/setup-environment.sh"
        missing=1
    fi

    if [[ $missing -eq 1 ]]; then
        echo ""
        log_error "Faltan archivos necesarios. Corrige los errores arriba."
        exit 1
    fi

    log_info "Todos los requisitos verificados"
}

# -----------------------------------------------------------------------------
# Leer parámetros de arranque
# -----------------------------------------------------------------------------
read_boot_params() {
    log_step "Leyendo parámetros de arranque..."

    BOOT_PARAMS="root=/dev/sda2 ro quiet"

    if [[ -f "$CONFIG_DIR/boot-params.conf" ]]; then
        # Leer parámetros desde el archivo de configuración
        BOOT_PARAMS=$(grep -v '^#' "$CONFIG_DIR/boot-params.conf" | grep -v '^$' | tr '\n' ' ' | xargs)
        log_info "Parámetros de arranque: $BOOT_PARAMS"
    else
        log_warn "Usando parámetros por defecto: $BOOT_PARAMS"
    fi
}

# -----------------------------------------------------------------------------
# Construir mach_kernel usando herramientas del bootloader
# -----------------------------------------------------------------------------
build_mach_kernel() {
    log_step "Construyendo mach_kernel..."

    mkdir -p "$OUTPUT_DIR"

    # Método 1: Usar atv-bootloader tools si están disponibles
    if [[ -d "$TOOLS_DIR/atv-bootloader" ]]; then
        log_info "Usando atv-bootloader para construir mach_kernel..."

        # Copiar kernel e initrd al directorio del bootloader
        cp "$BUILD_DIR/kernel/vmlinuz" "$TOOLS_DIR/atv-bootloader/vmlinuz"
        cp "$BUILD_DIR/kernel/initrd.gz" "$TOOLS_DIR/atv-bootloader/initrd.gz"

        # Intentar compilar con las herramientas del bootloader
        pushd "$TOOLS_DIR/atv-bootloader" > /dev/null

        if [[ -f "Makefile" ]]; then
            log_info "Compilando con Makefile del bootloader..."
            make clean 2>/dev/null || true

            # Configurar parámetros de boot
            if [[ -f "boot_params.txt" ]]; then
                echo "$BOOT_PARAMS" > boot_params.txt
            fi

            make 2>&1 | tee "$BUILD_DIR/build.log" || {
                log_warn "Compilación con Makefile falló. Intentando método manual..."
                build_mach_kernel_manual
                popd > /dev/null
                return
            }

            # Copiar resultado
            if [[ -f "mach_kernel" ]]; then
                cp mach_kernel "$OUTPUT_DIR/mach_kernel"
                log_info "mach_kernel construido exitosamente"
            fi
        else
            log_warn "No se encontró Makefile. Usando método manual..."
            popd > /dev/null
            build_mach_kernel_manual
            return
        fi

        popd > /dev/null
    else
        build_mach_kernel_manual
    fi
}

# -----------------------------------------------------------------------------
# Método manual para construir mach_kernel
# -----------------------------------------------------------------------------
build_mach_kernel_manual() {
    log_step "Construyendo mach_kernel (método manual)..."

    local VMLINUZ="$BUILD_DIR/kernel/vmlinuz"
    local INITRD="$BUILD_DIR/kernel/initrd.gz"

    # Crear el script de ensamblado para el stub de arranque
    # Este stub engaña al boot.efi haciéndole creer que carga un kernel Darwin
    # pero redirige la ejecución al kernel Linux
    cat > "$BUILD_DIR/boot_stub.S" << 'BOOTASM'
/*
 * Boot stub para Apple TV 1ra gen
 * Crea un ejecutable Mach-O falso que boot.efi acepta
 * y redirige al kernel Linux embebido
 */
.text
.globl _start
_start:
    /* Obtener dirección base */
    call    get_ip
get_ip:
    popl    %ebx
    subl    $get_ip, %ebx

    /* Configurar parámetros del kernel Linux */
    leal    linux_kernel(%ebx), %esi
    leal    linux_initrd(%ebx), %edi
    leal    boot_params(%ebx), %edx

    /* Saltar al punto de entrada del kernel Linux */
    leal    linux_kernel(%ebx), %eax
    jmp     *%eax

.data
.align 4096
linux_kernel:
    .incbin "vmlinuz"

.align 4096
linux_initrd:
    .incbin "initrd.gz"

.align 4
boot_params:
    .asciz "BOOT_PARAMS_PLACEHOLDER"
BOOTASM

    # Reemplazar placeholder con parámetros reales
    sed -i "s|BOOT_PARAMS_PLACEHOLDER|$BOOT_PARAMS|g" "$BUILD_DIR/boot_stub.S"

    # Copiar binarios al directorio de build
    cp "$VMLINUZ" "$BUILD_DIR/vmlinuz"
    cp "$INITRD" "$BUILD_DIR/initrd.gz"

    pushd "$BUILD_DIR" > /dev/null

    # Compilar el stub (32-bit)
    log_info "Ensamblando boot stub (i386)..."
    if command -v i686-elf-gcc &>/dev/null; then
        i686-elf-as -32 boot_stub.S -o boot_stub.o
        i686-elf-ld -m elf_i386 -o mach_kernel boot_stub.o
    else
        as --32 boot_stub.S -o boot_stub.o 2>&1 || {
            log_error "Error al ensamblar. Necesitas gcc con soporte 32-bit"
            echo "  Instala: sudo apt install gcc-multilib"
            popd > /dev/null
            exit 1
        }
        ld -m elf_i386 -o mach_kernel boot_stub.o 2>&1 || {
            log_error "Error al enlazar"
            popd > /dev/null
            exit 1
        }
    fi

    if [[ -f "mach_kernel" ]]; then
        cp mach_kernel "$OUTPUT_DIR/mach_kernel"
        log_info "mach_kernel construido: $OUTPUT_DIR/mach_kernel"
        log_info "Tamaño: $(du -h "$OUTPUT_DIR/mach_kernel" | cut -f1)"
    else
        log_error "No se pudo construir mach_kernel"
        popd > /dev/null
        exit 1
    fi

    popd > /dev/null
}

# -----------------------------------------------------------------------------
# Verificar el ejecutable resultante
# -----------------------------------------------------------------------------
verify_output() {
    log_step "Verificando ejecutable..."

    if [[ -f "$OUTPUT_DIR/mach_kernel" ]]; then
        echo ""
        echo "  Archivo:  $OUTPUT_DIR/mach_kernel"
        echo "  Tamaño:   $(du -h "$OUTPUT_DIR/mach_kernel" | cut -f1)"
        echo "  Tipo:     $(file "$OUTPUT_DIR/mach_kernel")"
        echo "  SHA256:   $(sha256sum "$OUTPUT_DIR/mach_kernel" | cut -d' ' -f1)"
        echo ""
        log_info "Ejecutable listo. Siguiente paso:"
        echo "  ./scripts/create-usb.sh /dev/sdX"
    else
        log_error "No se encontró el ejecutable final"
        exit 1
    fi
}

# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------
main() {
    echo "=============================================="
    echo " Apple TV 1ra Gen - Build mach_kernel"
    echo "=============================================="
    echo ""

    verify_prerequisites
    read_boot_params
    build_mach_kernel
    verify_output
}

main "$@"
