/* Ejecuta las pruebas de dominio en Node:  node tests/run.mjs  */
import { ejecutar } from './casos.js';

const { resultados, ok, fallos, total } = ejecutar();

for (const suite of resultados) {
  console.log(`\n  ${suite.nombre}`);
  for (const caso of suite.casos) {
    if (caso.errores.length) {
      console.log(`    ✗ ${caso.nombre}`);
      caso.errores.forEach((e) => console.log(`        ${e}`));
    } else {
      console.log(`    ✓ ${caso.nombre}`);
    }
  }
}

console.log(`\n  ${ok}/${total} pruebas en verde${fallos ? `, ${fallos} con fallas` : ''}\n`);
process.exit(fallos ? 1 : 0);
