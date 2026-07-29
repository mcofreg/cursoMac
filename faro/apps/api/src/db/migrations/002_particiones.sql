-- ════════════════════════════════════════════════════════════════════════════
-- Particionamiento y retención de la tabla de eventos.
--
-- La retención no es una optimización: es un compromiso de privacidad. Los
-- eventos con identificación individual viven 90 días; después queda solo el
-- agregado. `purgar_eventos_antiguos()` es lo que hace ese compromiso real.
-- ════════════════════════════════════════════════════════════════════════════

-- Crea las particiones diarias que falten, con anticipación configurable.
CREATE OR REPLACE FUNCTION asegurar_particiones_eventos(dias_adelante integer DEFAULT 7)
RETURNS integer AS $$
DECLARE
  d            date;
  nombre       text;
  creadas      integer := 0;
BEGIN
  FOR d IN
    SELECT generate_series(
      current_date - interval '1 day',
      current_date + (dias_adelante || ' days')::interval,
      interval '1 day'
    )::date
  LOOP
    nombre := format('events_%s', to_char(d, 'YYYYMMDD'));

    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = nombre) THEN
      EXECUTE format(
        'CREATE TABLE %I PARTITION OF events FOR VALUES FROM (%L) TO (%L)',
        nombre, d, d + 1
      );
      creadas := creadas + 1;
    END IF;
  END LOOP;

  RETURN creadas;
END;
$$ LANGUAGE plpgsql;

-- Elimina particiones más antiguas que la ventana de retención.
CREATE OR REPLACE FUNCTION purgar_eventos_antiguos(dias_retencion integer DEFAULT 90)
RETURNS integer AS $$
DECLARE
  particion  record;
  corte      date := current_date - dias_retencion;
  eliminadas integer := 0;
BEGIN
  FOR particion IN
    SELECT c.relname AS nombre
    FROM pg_class c
    JOIN pg_inherits i ON i.inhrelid = c.oid
    JOIN pg_class padre ON padre.oid = i.inhparent
    WHERE padre.relname = 'events'
      AND c.relname ~ '^events_[0-9]{8}$'
      AND to_date(substring(c.relname from 8), 'YYYYMMDD') < corte
  LOOP
    EXECUTE format('DROP TABLE %I', particion.nombre);
    eliminadas := eliminadas + 1;
  END LOOP;

  RETURN eliminadas;
END;
$$ LANGUAGE plpgsql;

SELECT asegurar_particiones_eventos(7);
