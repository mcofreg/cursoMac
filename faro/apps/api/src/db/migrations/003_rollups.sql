-- ════════════════════════════════════════════════════════════════════════════
-- Agregación de métricas.
--
-- Idempotente: reprocesar el mismo día produce el mismo resultado. Se ejecuta
-- cada hora sobre las últimas 26 horas, de modo que los eventos que llegan
-- tarde (cola offline de un equipo que estuvo sin red) se incorporan solos.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION recalcular_metricas(desde timestamptz, hasta timestamptz)
RETURNS integer AS $$
DECLARE
  filas integer;
BEGIN
  -- Se borra y se reinserta el rango en vez de hacer UPSERT por métrica: si un
  -- corte (sucursal, rol) deja de tener eventos, su fila tiene que desaparecer,
  -- no quedarse con el último valor conocido.
  DELETE FROM campaign_daily_metrics
  WHERE dia BETWEEN desde::date AND hasta::date;

  INSERT INTO campaign_daily_metrics (
    dia, campaign_id, campaign_version, variante, sucursal, region, rol,
    entregados_unicos, impresiones, alcance_unico, clics, clics_unicos,
    acuses, descartes, suprimidos, dwell_ms_p50, dwell_ms_p90
  )
  SELECT
    recibido_en::date                                              AS dia,
    campaign_id,
    COALESCE(campaign_version, 0)                                  AS campaign_version,
    COALESCE(variante, 'target')                                   AS variante,
    COALESCE(sucursal, '')                                         AS sucursal,
    COALESCE(region, '')                                           AS region,
    COALESCE(rol, '')                                              AS rol,

    COUNT(DISTINCT install_id) FILTER (WHERE tipo = 'entregado')   AS entregados_unicos,
    COUNT(*)                   FILTER (WHERE tipo = 'impresion')   AS impresiones,
    COUNT(DISTINCT install_id) FILTER (WHERE tipo = 'impresion')   AS alcance_unico,
    COUNT(*)                   FILTER (WHERE tipo = 'clic')        AS clics,
    COUNT(DISTINCT install_id) FILTER (WHERE tipo = 'clic')        AS clics_unicos,
    COUNT(DISTINCT install_id) FILTER (WHERE tipo = 'acuse')       AS acuses,
    COUNT(DISTINCT install_id) FILTER (WHERE tipo = 'descarte')    AS descartes,
    COUNT(DISTINCT install_id) FILTER (WHERE tipo = 'suprimido')   AS suprimidos,

    PERCENTILE_DISC(0.5) WITHIN GROUP (ORDER BY dwell_ms)
      FILTER (WHERE tipo = 'fin_vista' AND dwell_ms IS NOT NULL)::integer AS dwell_p50,
    PERCENTILE_DISC(0.9) WITHIN GROUP (ORDER BY dwell_ms)
      FILTER (WHERE tipo = 'fin_vista' AND dwell_ms IS NOT NULL)::integer AS dwell_p90

  FROM events
  WHERE recibido_en >= desde
    AND recibido_en <  hasta
    AND campaign_id IS NOT NULL
  GROUP BY 1, 2, 3, 4, 5, 6, 7;

  GET DIAGNOSTICS filas = ROW_COUNT;

  -- Actividad diaria: alimenta la base instalada activa.
  INSERT INTO install_daily_activity (dia, install_id)
  SELECT DISTINCT recibido_en::date, install_id
  FROM events
  WHERE recibido_en >= desde AND recibido_en < hasta
  ON CONFLICT DO NOTHING;

  RETURN filas;
END;
$$ LANGUAGE plpgsql;
