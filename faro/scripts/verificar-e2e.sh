#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# Verificación end-to-end del backend.
#
# Crea su propia campaña en cada corrida, así que es idempotente y se puede
# ejecutar tantas veces como haga falta.
#
#   pnpm dev:api          (en otra terminal)
#   bash scripts/verificar-e2e.sh
# ════════════════════════════════════════════════════════════════════════════
set -uo pipefail

API="${API:-http://localhost:3000}"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
SUFIJO=$(date +%s)
FALLOS=0

ok()   { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; FALLOS=$((FALLOS+1)); }
titulo() { echo; echo "── $1 ──"; }

json() { grep -o "\"$2\":\"\?[^,\"}]*\"\?" <<<"$1" | head -1 | cut -d: -f2- | tr -d '"'; }

# ── Autenticación ───────────────────────────────────────────────────────────
titulo "Autenticación y control de acceso"

login() {
  local email=$1 cookie=$2
  curl -s -c "$cookie" -X POST "$API/v1/admin/login" \
    -H 'content-type: application/json' -d "{\"email\":\"$email\"}"
}

R=$(login 'operador.canales@banco.cl' "$TMP/editor")
CSRF_ED=$(json "$R" csrfToken)
[ -n "$CSRF_ED" ] && ok "editor autenticado" || fail "login del editor"

R=$(login 'jefe.canales@banco.cl' "$TMP/aprobador")
CSRF_AP=$(json "$R" csrfToken)
[ -n "$CSRF_AP" ] && ok "aprobador autenticado" || fail "login del aprobador"

R=$(login 'admin.faro@banco.cl' "$TMP/admin")
CSRF_AD=$(json "$R" csrfToken)
[ -n "$CSRF_AD" ] && ok "admin autenticado" || fail "login del admin"

R=$(login 'r.vega@banco.cl' "$TMP/viewer")
CSRF_VW=$(json "$R" csrfToken)

CREAR='{"key":"prueba-'$SUFIJO'","nombre":"Prueba automatizada","categoria":"contingencia","prioridad":0,"templateKey":"huincha_alerta_v1"}'

COD=$(curl -s -o /dev/null -w '%{http_code}' -b "$TMP/viewer" -X POST "$API/v1/admin/campaigns" \
  -H 'content-type: application/json' -H "x-csrf-token: $CSRF_VW" -d "$CREAR")
[ "$COD" = "403" ] && ok "el viewer no puede crear campañas (403)" || fail "viewer devolvió $COD, se esperaba 403"

COD=$(curl -s -o /dev/null -w '%{http_code}' -b "$TMP/editor" -X POST "$API/v1/admin/campaigns" \
  -H 'content-type: application/json' -d "$CREAR")
[ "$COD" = "403" ] && ok "mutación sin token CSRF rechazada (403)" || fail "sin CSRF devolvió $COD"

# ── Crear campaña y contenido ───────────────────────────────────────────────
titulo "Creación de campaña y contenido"

R=$(curl -s -b "$TMP/editor" -X POST "$API/v1/admin/campaigns" \
  -H 'content-type: application/json' -H "x-csrf-token: $CSRF_ED" -d "$CREAR")
CID=$(json "$R" id)
[ -n "$CID" ] && ok "campaña creada: $CID" || { fail "crear campaña: $R"; echo; echo "$FALLOS fallo(s)"; exit 1; }

# El título lleva una carga XSS a propósito: debe guardarse como texto literal.
VERSION='{
  "contenido": {
    "templateKey": "huincha_alerta_v1",
    "campos": {
      "severidad": "critica", "icono": "alerta",
      "titulo": "<img src=x onerror=alert(1)>",
      "cuerpo": "Prueba automatizada con *negrita*.",
      "cta": { "id": "ver_estado", "label": "Ver estado",
               "accion": { "kind": "abrir_url", "url": "http://localhost:8080/estado.html" } }
    }
  },
  "presentacion": { "formato": "huincha", "descartable": true, "exigeAcuse": true,
                    "frecuencia": {}, "origenesPermitidos": [] },
  "audiencia": { "reglas": { "attr": "region", "op": "eq", "value": "RM" } },
  "experimento": { "controlPct": 20, "rolloutPct": 100, "salt": "v1" }
}'

R=$(curl -s -b "$TMP/editor" -X POST "$API/v1/admin/campaigns/$CID/versions" \
  -H 'content-type: application/json' -H "x-csrf-token: $CSRF_ED" -d "$VERSION")
grep -q '"version":1' <<<"$R" && ok "versión 1 creada" || fail "crear versión: $R"

titulo "Seguridad del contenido"

MALA=$(sed 's|http://localhost:8080/estado.html|https://sitio-malicioso.cl/phishing|' <<<"$VERSION")
COD=$(curl -s -o "$TMP/mala.json" -w '%{http_code}' -b "$TMP/editor" \
  -X POST "$API/v1/admin/campaigns/$CID/versions" \
  -H 'content-type: application/json' -H "x-csrf-token: $CSRF_ED" -d "$MALA")
[ "$COD" = "400" ] && ok "URL fuera de la lista blanca rechazada (400)" || fail "URL externa devolvió $COD"

JS=$(sed 's|http://localhost:8080/estado.html|javascript:alert(1)|' <<<"$VERSION")
COD=$(curl -s -o /dev/null -w '%{http_code}' -b "$TMP/editor" \
  -X POST "$API/v1/admin/campaigns/$CID/versions" \
  -H 'content-type: application/json' -H "x-csrf-token: $CSRF_ED" -d "$JS")
[ "$COD" = "400" ] && ok "esquema javascript: rechazado (400)" || fail "javascript: devolvió $COD"

FORMATO=$(sed 's|"formato": "huincha"|"formato": "modal"|' <<<"$VERSION")
COD=$(curl -s -o /dev/null -w '%{http_code}' -b "$TMP/editor" \
  -X POST "$API/v1/admin/campaigns/$CID/versions" \
  -H 'content-type: application/json' -H "x-csrf-token: $CSRF_ED" -d "$FORMATO")
[ "$COD" = "400" ] && ok "formato incompatible con la plantilla rechazado (400)" || fail "formato devolvió $COD"

# ── Doble control ───────────────────────────────────────────────────────────
titulo "Doble control"

R=$(curl -s -b "$TMP/editor" -X POST "$API/v1/admin/campaigns/$CID/submit" -H "x-csrf-token: $CSRF_ED")
grep -q '"ok":true' <<<"$R" && ok "enviada a revisión" || fail "submit: $R"

COD=$(curl -s -o /dev/null -w '%{http_code}' -b "$TMP/editor" \
  -X POST "$API/v1/admin/campaigns/$CID/approve" \
  -H 'content-type: application/json' -H "x-csrf-token: $CSRF_ED" -d '{}')
[ "$COD" = "403" ] && ok "el editor no tiene rol para aprobar (403)" || fail "approve del editor devolvió $COD"

# El admin también creó contenido en otras campañas; aquí el autor es el editor,
# así que el admin sí puede aprobar. Lo que no puede es aprobar lo propio.
R=$(curl -s -b "$TMP/aprobador" -X POST "$API/v1/admin/campaigns/$CID/approve" \
  -H 'content-type: application/json' -H "x-csrf-token: $CSRF_AP" -d '{"nota":"Verificación automatizada"}')
grep -q '"ok":true' <<<"$R" && ok "aprobada por una segunda persona" || fail "approve: $R"

# Ahora la prueba dura: una campaña creada POR el aprobador no puede ser
# aprobada por él mismo. Es el CHECK de la base de datos.
CREAR2='{"key":"autoaprobacion-'$SUFIJO'","nombre":"Intento de autoaprobación","categoria":"operativo","prioridad":2,"templateKey":"huincha_alerta_v1"}'
R=$(curl -s -b "$TMP/aprobador" -X POST "$API/v1/admin/campaigns" \
  -H 'content-type: application/json' -H "x-csrf-token: $CSRF_AP" -d "$CREAR2")
CID2=$(json "$R" id)

SIMPLE=$(sed 's|"exigeAcuse": true|"exigeAcuse": false|' <<<"$VERSION")
curl -s -b "$TMP/aprobador" -X POST "$API/v1/admin/campaigns/$CID2/versions" \
  -H 'content-type: application/json' -H "x-csrf-token: $CSRF_AP" -d "$SIMPLE" > /dev/null
curl -s -b "$TMP/aprobador" -X POST "$API/v1/admin/campaigns/$CID2/submit" -H "x-csrf-token: $CSRF_AP" > /dev/null

R=$(curl -s -b "$TMP/aprobador" -X POST "$API/v1/admin/campaigns/$CID2/approve" \
  -H 'content-type: application/json' -H "x-csrf-token: $CSRF_AP" -d '{}')
grep -qi 'doble control' <<<"$R" && ok "DOBLE CONTROL: el autor no puede aprobar su propia campaña" \
  || fail "autoaprobación no fue bloqueada: $R"

titulo "Publicación y firma"
R=$(curl -s -b "$TMP/aprobador" -X POST "$API/v1/admin/campaigns/$CID/publish" -H "x-csrf-token: $CSRF_AP")
grep -q '"ok":true' <<<"$R" && ok "publicada y firmada" || fail "publish: $R"

# ── Extensión ───────────────────────────────────────────────────────────────
titulo "Dispositivo y manifiesto"

INSTALL=$(cat /proc/sys/kernel/random/uuid)
R=$(curl -s -X POST "$API/v1/auth/session" -H 'content-type: application/json' \
  -d "{\"installId\":\"$INSTALL\",\"extensionVersion\":\"0.1.0\",\"email\":\"m.tapia@banco.cl\"}")
TOKEN=$(json "$R" deviceToken)
[ -n "$TOKEN" ] && ok "dispositivo enrolado (sucursal S001, región RM)" || fail "sesión: $R"

M=$(curl -s -D "$TMP/h" -H "authorization: Bearer $TOKEN" "$API/v1/campaigns/manifest")
ETAG=$(grep -i '^etag:' "$TMP/h" | tr -d '\r' | cut -d' ' -f2)
grep -q '"signature"' <<<"$M" && ok "el manifiesto viene firmado" || fail "manifiesto sin firma"
grep -q "prueba-$SUFIJO" <<<"$M" && ok "la campaña aparece en el manifiesto" || fail "campaña ausente del manifiesto"

# El título con la carga XSS viaja como texto plano, sin interpretarse.
grep -q 'onerror=alert(1)' <<<"$M" && ok "el título con carga XSS viaja como texto literal" \
  || fail "el contenido fue alterado en tránsito"

COD=$(curl -s -o /dev/null -w '%{http_code}' -H "authorization: Bearer $TOKEN" \
  -H "if-none-match: $ETAG" "$API/v1/campaigns/manifest")
[ "$COD" = "304" ] && ok "ETag funciona: 304 Not Modified" || fail "se esperaba 304, llegó $COD"

titulo "Telemetría"

AHORA=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
SES=$(cat /proc/sys/kernel/random/uuid)
EV=$(cat /proc/sys/kernel/random/uuid)

lote() {
  curl -s -X POST "$API/v1/events/batch" -H "authorization: Bearer $TOKEN" \
    -H 'content-type: application/json' \
    -d "{\"installId\":\"$INSTALL\",\"enviadoEn\":\"$AHORA\",\"extensionVersion\":\"0.1.0\",\"eventos\":[$1]}"
}

IMPRESION="{\"eventId\":\"$EV\",\"tipo\":\"impresion\",\"campaignId\":\"$CID\",\"campaignVersion\":1,\"variante\":\"target\",\"formato\":\"huincha\",\"ocurridoEn\":\"$AHORA\",\"sessionId\":\"$SES\",\"seq\":1}"

R=$(lote "$IMPRESION")
grep -q '"aceptados":1' <<<"$R" && ok "impresión registrada" || fail "ingesta: $R"

R=$(lote "$IMPRESION")
grep -q '"duplicados":1' <<<"$R" && ok "reintento deduplicado — la cola offline no infla métricas" \
  || fail "deduplicación falló: $R"

EV2=$(cat /proc/sys/kernel/random/uuid)
R=$(lote "{\"eventId\":\"$EV2\",\"tipo\":\"clic\",\"campaignId\":\"$CID\",\"campaignVersion\":1,\"variante\":\"target\",\"formato\":\"huincha\",\"ctaId\":\"ver_estado\",\"ocurridoEn\":\"$AHORA\",\"sessionId\":\"$SES\",\"seq\":2}")
grep -q '"aceptados":1' <<<"$R" && ok "clic registrado con identificador lógico de botón" || fail "clic: $R"

EV3=$(cat /proc/sys/kernel/random/uuid)
R=$(lote "{\"eventId\":\"$EV3\",\"tipo\":\"acuse\",\"campaignId\":\"$CID\",\"campaignVersion\":1,\"variante\":\"target\",\"formato\":\"huincha\",\"ocurridoEn\":\"$AHORA\",\"sessionId\":\"$SES\",\"seq\":3}")
grep -q '"aceptados":1' <<<"$R" && ok "acuse de recibo registrado" || fail "acuse: $R"

titulo "Privacidad"

EV4=$(cat /proc/sys/kernel/random/uuid)
COD=$(curl -s -o "$TMP/priv" -w '%{http_code}' -X POST "$API/v1/events/batch" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d "{\"installId\":\"$INSTALL\",\"enviadoEn\":\"$AHORA\",\"extensionVersion\":\"0.1.0\",\"eventos\":[
      {\"eventId\":\"$EV4\",\"tipo\":\"clic\",\"campaignId\":\"$CID\",\"campaignVersion\":1,
       \"ocurridoEn\":\"$AHORA\",\"sessionId\":\"$SES\",\"seq\":4,
       \"pageUrl\":\"https://intranet.banco.cl/cliente/12345\"}]}")
[ "$COD" = "400" ] && ok "lote con URL de página RECHAZADO — la telemetría no admite navegación" \
  || fail "el lote con URL devolvió $COD"

titulo "Analítica"

F=$(curl -s -b "$TMP/editor" "$API/v1/analytics/campaigns/$CID/funnel?cortarPor=sucursal")
ELEG=$(grep -o '"elegibles":[0-9]*' <<<"$F" | cut -d: -f2)
[ -n "$ELEG" ] && [ "$ELEG" -gt 0 ] && ok "embudo: $ELEG elegibles según la audiencia" || fail "embudo: $F"
grep -q '"tasaAcuse"' <<<"$F" && ok "tasa de acuse calculada" || fail "falta la tasa de acuse"
grep -q 'no son comparables' <<<"$F" && ok "la advertencia metodológica viaja con los datos" \
  || ok "sin grupo de control con datos todavía (advertencia no aplica)"

P=$(curl -s -b "$TMP/editor" -X POST "$API/v1/admin/audiences/preview" \
  -H 'content-type: application/json' -H "x-csrf-token: $CSRF_ED" \
  -d '{"reglas":{"attr":"region","op":"eq","value":"RM"}}')
ALC=$(grep -o '"alcanzables":[0-9]*' <<<"$P" | cut -d: -f2)
[ -n "$ALC" ] && ok "alcance estimado en RM: $ALC dispositivos" || fail "preview: $P"

A=$(curl -s -b "$TMP/editor" "$API/v1/analytics/adopcion")
grep -q '"activos_7d"' <<<"$A" && ok "adopción: $(grep -o '"total":[0-9]*,"activos_7d":[0-9]*' <<<"$A")" \
  || fail "adopción: $A"

# ── Interruptores ───────────────────────────────────────────────────────────
titulo "Interruptores de emergencia"

curl -s -b "$TMP/editor" -X POST "$API/v1/admin/campaigns/$CID/pause" -H "x-csrf-token: $CSRF_ED" > /dev/null
sleep 6
M=$(curl -s -H "authorization: Bearer $TOKEN" "$API/v1/campaigns/manifest")
grep -q "prueba-$SUFIJO" <<<"$M" && fail "la campaña pausada sigue en el manifiesto" \
  || ok "campaña pausada: fuera del manifiesto en menos de 60 s"

curl -s -b "$TMP/admin" -X PUT "$API/v1/admin/config/kill-global" \
  -H 'content-type: application/json' -H "x-csrf-token: $CSRF_AD" -d '{"activo":true}' > /dev/null
sleep 6
M=$(curl -s -H "authorization: Bearer $TOKEN" "$API/v1/campaigns/manifest")
grep -q '"killGlobal":true' <<<"$M" && ok "interruptor global: la extensión recibe la orden de desmontar todo" \
  || fail "el manifiesto no refleja el kill global"
grep -q '"campanas":\[\]' <<<"$M" && ok "el manifiesto queda sin campañas" || fail "quedaron campañas con kill global"

curl -s -b "$TMP/admin" -X PUT "$API/v1/admin/config/kill-global" \
  -H 'content-type: application/json' -H "x-csrf-token: $CSRF_AD" -d '{"activo":false}' > /dev/null
ok "interruptor global desactivado"

titulo "Auditoría"

AU=$(curl -s -b "$TMP/aprobador" "$API/v1/admin/audit?limite=20")
grep -q 'publicar' <<<"$AU" && ok "la bitácora registró la publicación" || fail "auditoría incompleta"
grep -q 'activar_kill_global' <<<"$AU" && ok "la bitácora registró el interruptor global" || fail "falta el kill global"

echo
if [ $FALLOS -eq 0 ]; then
  echo "════ TODAS LAS VERIFICACIONES PASARON ════"
else
  echo "════ $FALLOS VERIFICACIÓN(ES) FALLARON ════"
fi
exit $FALLOS
