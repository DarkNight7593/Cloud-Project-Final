#!/bin/bash

set -e  # Detener si hay algún error

# Colores para mejorar la lectura
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# === CONFIGURACIÓN SWAGGERHUB ===
OWNER="utec-b5d"
API_KEY="14cd2429-9dbd-46d1-ba15-85fc643e7cba"
CONFIG_FILE="$HOME/.config/swaggerhub-cli/config.json"

# Verificar e instalar swaggerhub-cli
if ! command -v swaggerhub &> /dev/null; then
  echo -e "${GREEN}📦 Instalando SwaggerHub CLI...${NC}"
  npm install -g swaggerhub-cli
fi

# Crear configuración si no existe
if [ ! -f "$CONFIG_FILE" ]; then
  echo -e "${GREEN}🔐 Configurando SwaggerHub CLI con tu API Key...${NC}"
  mkdir -p "$(dirname "$CONFIG_FILE")"
  echo "{\"SWAGGERHUB_URL\":\"https://api.swaggerhub.com\",\"SWAGGERHUB_API_KEY\":\"$API_KEY\"}" > "$CONFIG_FILE"
fi

# Deploy Api-Usuario
echo -e "${GREEN}1. Desplegando Api-Usuario...${NC}"
cd Api-Usuario

[ ! -f "package.json" ] && npm init -y
npm install --save-dev serverless-openapi-documentation
sls deploy
sls openapi generate -o openapi.json
SERVICE=$(grep '^service:' serverless.yml | awk '{print $2}')
swaggerhub api:create "$OWNER/$SERVICE/1.0.0" --file openapi.json --setdefault --published publish --visibility public || \
swaggerhub api:update "$OWNER/$SERVICE/1.0.0" --file openapi.json --published publish
echo -e "${GREEN}✅ Swagger UI: https://app.swaggerhub.com/apis/$OWNER/$SERVICE/1.0.0${NC}"
cd ..

# Deploy Api-Org
echo -e "${GREEN}2. Desplegando Api-Org...${NC}"
cd Api-Org

[ ! -f "package.json" ] && npm init -y
npm install --save-dev serverless-openapi-documentation
sls deploy
sls openapi generate -o openapi.json
SERVICE=$(grep '^service:' serverless.yml | awk '{print $2}')
swaggerhub api:create "$OWNER/$SERVICE/1.0.0" --file openapi.json --setdefault --published publish --visibility public || \
swaggerhub api:update "$OWNER/$SERVICE/1.0.0" --file openapi.json --published publish
echo -e "${GREEN}✅ Swagger UI: https://app.swaggerhub.com/apis/$OWNER/$SERVICE/1.0.0${NC}"
cd ..

# Función para desplegar servicios Node.js
deploy_node_service() {
  SERVICE_DIR=$1
  echo -e "${GREEN}▶️  Desplegando $SERVICE_DIR...${NC}"
  cd "$SERVICE_DIR"

  [ ! -f "package.json" ] && npm init -y
  npm install aws-sdk
  npm install --save-dev serverless-openapi-documentation

  sls deploy
  sls openapi generate -o openapi.json

  SERVICE=$(grep '^service:' serverless.yml | awk '{print $2}')
  swaggerhub api:create "$OWNER/$SERVICE/1.0.0" --file openapi.json --setdefault --published publish --visibility public || \
  swaggerhub api:update "$OWNER/$SERVICE/1.0.0" --file openapi.json --published publish
  echo -e "${GREEN}✅ Swagger UI: https://app.swaggerhub.com/apis/$OWNER/$SERVICE/1.0.0${NC}"

  cd ../..
}

# Desplegar Node.js servicios
deploy_node_service "Producto/Api-Horarios"
deploy_node_service "Producto/Api-Cursos"
deploy_node_service "Api-Compras"

echo -e "${GREEN}🚀 Despliegue completo y documentación publicada en SwaggerHub.${NC}"
