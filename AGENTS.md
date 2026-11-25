# Asia Trip 2026

- Repositorio autocontenido para una SPA/PWA estática en Vite y TypeScript. GitHub Pages sirve el resultado compilado. No se necesita un repositorio de API.
- Usa base relativa, navegación por fragmentos, recursos locales y estado local versionado. Revisa el esquema, su validación y el importador juntos al cambiar el formato de los datos.
- Para cambios en horarios, entradas o transporte, registra fuente y fecha de consulta. Señala los datos pendientes y las estimaciones.
- Para verificar cambios, usa `npm run lint`, `npm test`, `npm run build` y las pruebas Playwright relevantes.
- El remoto de GitHub es `Urtxe/Singapur-KualaLumpur`. `develop` es la rama de integración y `main` la de producción. Crea ramas `feature/` o `fix/` desde la rama de integración y solicita aprobación antes de cada merge. GitHub Actions publica en Pages desde `main` tras las comprobaciones.
