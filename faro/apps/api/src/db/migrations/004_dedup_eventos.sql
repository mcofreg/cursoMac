-- ════════════════════════════════════════════════════════════════════════════
-- Deduplicación de eventos.
--
-- PROBLEMA QUE RESUELVE
-- `events` está particionada por `recibido_en`, y Postgres exige que la clave
-- primaria de una tabla particionada incluya la columna de partición. Con
-- PRIMARY KEY (event_id, recibido_en) y `recibido_en DEFAULT now()`, un mismo
-- evento reenviado obtiene una marca distinta y NO colisiona: el
-- `ON CONFLICT DO NOTHING` de la ingesta nunca dispara.
--
-- El efecto es silencioso y corrosivo: cada reintento de la cola offline —que
-- por diseño reintenta con backoff hasta 2 horas— sumaría una impresión más.
-- Las métricas quedarían infladas justamente para los equipos con peor
-- conectividad, que son los que más importan en la red de sucursales.
--
-- SOLUCIÓN
-- Una tabla sin particionar con PRIMARY KEY (event_id). La ingesta inserta ahí
-- primero: si la fila ya existía, el evento es un duplicado y no se escribe en
-- `events`. No depende del reloj del cliente ni del momento de llegada.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE event_dedup (
  event_id    uuid PRIMARY KEY,
  recibido_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dedup_recibido ON event_dedup(recibido_en);

-- Retención de la tabla de deduplicación.
--
-- El backoff máximo de la cola es de 2 horas y el buffer se vacía al reabrir el
-- navegador, así que 14 días cubre con holgura incluso un equipo apagado por
-- vacaciones. Pasado ese plazo, un reenvío tardío se contaría de nuevo — es un
-- riesgo aceptable frente a hacer crecer la tabla sin límite.
CREATE OR REPLACE FUNCTION purgar_dedup(dias integer DEFAULT 14)
RETURNS integer AS $$
DECLARE
  eliminadas integer;
BEGIN
  DELETE FROM event_dedup WHERE recibido_en < now() - (dias || ' days')::interval;
  GET DIAGNOSTICS eliminadas = ROW_COUNT;
  RETURN eliminadas;
END;
$$ LANGUAGE plpgsql;

-- Retropobla con los eventos ya existentes y elimina los duplicados que la
-- clave primaria anterior dejó pasar, conservando la primera aparición.
INSERT INTO event_dedup (event_id, recibido_en)
SELECT event_id, MIN(recibido_en) FROM events GROUP BY event_id
ON CONFLICT DO NOTHING;

DELETE FROM events e
USING (
  SELECT event_id, MIN(recibido_en) AS primera
  FROM events GROUP BY event_id HAVING COUNT(*) > 1
) d
WHERE e.event_id = d.event_id AND e.recibido_en <> d.primera;
