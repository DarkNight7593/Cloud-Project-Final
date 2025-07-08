#!/bin/bash

set -e  # Detener si hay algún error

# Colores para mejorar la lectura
GREEN='\033[0;32m'
NC='\033[0m' # No Color


# Deploy Api-Usuario
echo -e "${GREEN}1. Desplegando Api-Usuario...${NC}"
cd Api-Usuario

sls deploy
cd ..

# Deploy Api-Org
echo -e "${GREEN}2. Desplegando Api-Org...${NC}"
cd Api-Org
sls deploy
cd ..

# Función para desplegar servicios Node.js
deploy_node_service() {
  SERVICE_DIR=$1
  echo -e "${GREEN}▶️  Desplegando $SERVICE_DIR...${NC}"
  cd "$SERVICE_DIR"

  [ ! -f "package.json" ] && npm init -y
  npm install aws-sdk
  sls deploy

  cd ../..
}

# Desplegar Node.js servicios
deploy_node_service "Producto/Api-Horarios"
deploy_node_service "Producto/Api-Cursos"
deploy_node_service "Api-Compras"

echo -e "${GREEN}🚀 Despliegue completo y documentación publicada en SwaggerHub.${NC}"
