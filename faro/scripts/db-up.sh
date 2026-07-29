#!/usr/bin/env bash
# Levanta PostgreSQL para el entorno local.
#
# Prefiere Docker Compose; si no hay demonio disponible (contenedores, equipos
# corporativos sin Docker), cae a un PostgreSQL instalado en el sistema. Las dos
# rutas terminan con la misma base y las mismas credenciales.
set -euo pipefail

DB_NAME="${DB_NAME:-faro}"
DB_USER="${DB_USER:-faro}"
DB_PASS="${DB_PASS:-faro}"
DB_PORT="${DB_PORT:-5432}"

if docker info >/dev/null 2>&1; then
  echo "Docker disponible: levantando con docker compose…"
  docker compose up -d postgres
  echo "Esperando a que PostgreSQL acepte conexiones…"
  for _ in $(seq 1 30); do
    if docker compose exec -T postgres pg_isready -U "$DB_USER" >/dev/null 2>&1; then
      echo "PostgreSQL listo en localhost:${DB_PORT}"
      exit 0
    fi
    sleep 1
  done
  echo "PostgreSQL no respondió a tiempo" >&2
  exit 1
fi

echo "Sin demonio Docker: usando el PostgreSQL del sistema."

if ! command -v pg_ctlcluster >/dev/null 2>&1 && ! command -v pg_ctl >/dev/null 2>&1; then
  echo "No hay PostgreSQL instalado ni Docker disponible." >&2
  echo "Instala PostgreSQL 16 o inicia Docker y vuelve a intentar." >&2
  exit 1
fi

if ! pg_isready -q 2>/dev/null; then
  echo "Iniciando el cluster…"
  if command -v pg_ctlcluster >/dev/null 2>&1; then
    pg_ctlcluster 16 main start 2>/dev/null || service postgresql start
  else
    pg_ctl -D /var/lib/postgresql/16/main start
  fi

  for _ in $(seq 1 30); do
    pg_isready -q 2>/dev/null && break
    sleep 1
  done
fi

if ! pg_isready -q 2>/dev/null; then
  echo "PostgreSQL no arrancó" >&2
  exit 1
fi

# Rol y base, idempotentes.
sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASS}' SUPERUSER"

sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1 || \
  sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"

echo "PostgreSQL listo en localhost:${DB_PORT} (base ${DB_NAME}, usuario ${DB_USER})"
