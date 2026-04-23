#!/bin/bash
# Fresh install - elimina contenedores, volumen de DB y levanta todo de nuevo

cd "$(dirname "$0")"

echo "🔄 Haciendo fresh install..."
echo ""

# 1. Detener y eliminar contenedores
echo "1/4: Deteniendo contenedores..."
docker compose down

# 2. Eliminar volumen de la base de datos
echo "2/4: Eliminando volumen de DB..."
docker volume rm activos_activos-db 2>/dev/null || echo "   (volumen no existe, ok)"

# 3. Levantar todo desde cero
echo "3/4: Levantando contenedores frescos..."
docker compose up -d

echo ""
echo "✅ Fresh install listo!"
echo ""
docker compose ps
echo ""
echo "Accede a: http://localhost:8980"
echo "Usuario: admin"
echo "Contraseña: admin123"