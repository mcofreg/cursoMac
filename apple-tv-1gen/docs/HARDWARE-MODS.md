# Modificaciones de Hardware - Apple TV 1ra Generación

## 1. Reemplazo del disco duro por SSD

El HDD IDE de 40/160 GB es el mayor cuello de botella. Reemplazarlo mejora
drásticamente el rendimiento.

### Materiales necesarios
- SSD SATA 2.5" (cualquier capacidad, 64-128 GB es más que suficiente)
- Adaptador IDE 44-pin a SATA (buscar "IDE 2.5 to SATA adapter")
- Destornillador Torx T10

### Procedimiento
1. Retirar la base de goma del Apple TV (está pegada)
2. Quitar los 4 tornillos Torx T10
3. Desconectar el cable IDE del disco duro
4. Conectar el adaptador IDE-SATA al cable
5. Conectar el SSD al adaptador
6. Verificar que cabe dentro de la carcasa (algunos adaptadores son gruesos)
7. Ensamblar y probar

## 2. Instalación de Crystal HD

La tarjeta Wi-Fi interna no funciona en Linux. Puedes reemplazarla por un
decodificador de video Crystal HD que permite reproducir video 1080p.

### Materiales necesarios
- Broadcom BCM970012 Crystal HD Decoder (mini PCIe half-height)
- Mismo destornillador Torx T10

### Procedimiento
1. Abrir el Apple TV (mismos pasos que arriba)
2. Localizar la tarjeta Wi-Fi (mini PCIe)
3. Desconectar los cables de antena
4. Retirar la tarjeta Wi-Fi
5. Insertar la tarjeta Crystal HD en el mismo slot
6. No reconectar los cables de antena (Crystal HD no los usa)
7. Ensamblar

### Nota sobre conectividad
Sin Wi-Fi, necesitarás usar Ethernet (cable) para conectividad de red.
El puerto Ethernet del Apple TV funciona correctamente en Linux.

## 3. Pasta térmica

Después de 15+ años, la pasta térmica original probablemente está seca.

### Materiales
- Pasta térmica de calidad (Arctic MX-4, Noctua NT-H1, etc.)
- Alcohol isopropílico 90%+ para limpiar

### Procedimiento
1. Abrir el Apple TV
2. Retirar el disipador del CPU
3. Limpiar pasta vieja con alcohol isopropílico
4. Aplicar cantidad del tamaño de un grano de arroz
5. Reinstalar disipador

## 4. RAM (NO recomendado)

La RAM está soldada al board. Se puede reemplazar teóricamente con
estación de resoldar de aire caliente, pero:
- Riesgo muy alto de dañar el board
- Difícil encontrar módulos DDR2 compatibles
- No se recomienda a menos que tengas experiencia en soldadura SMD
