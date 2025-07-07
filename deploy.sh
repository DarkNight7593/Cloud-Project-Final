#!/bin/bash

set -e  # Detener si hay algún error

# Colores para mejorar la lectura
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo -e "${GREEN}1. Desplegando Api-Usuario...${NC}"
cd Api-Usuario
# Solo si no existe package.json, inicializamos npm
    if [ ! -f "package.json" ]; then
        npm init -y
    fi
npm install -D serverless-auto-swagger
sls deploy 

cd ..

echo -e "${GREEN}1. Desplegando Api-Org...${NC}"
cd Api-Org
# Solo si no existe package.json, inicializamos npm
    if [ ! -f "package.json" ]; then
        npm init -y
    fi
npm install -D serverless-auto-swagger
sls deploy 

cd ..

# Función para instalar dependencias y desplegar
deploy_node_service() {
    SERVICE_DIR=$1
    echo -e "${GREEN}2. Preparando y desplegando ${SERVICE_DIR}...${NC}"
    cd "$SERVICE_DIR"

    # Solo si no existe package.json, inicializamos npm
    if [ ! -f "package.json" ]; then
        npm init -y
    fi

    # Asegurarse que aws-sdk esté instalado
    npm install aws-sdk
    npm install -D serverless-auto-swagger

    # Desplegar
    sls deploy 


    cd ..
    cd ..
}

# Desplegar servicios en orden
deploy_node_service "Producto/Api-Horarios"
deploy_node_service "Producto/Api-Cursos"
deploy_node_service "Api-Compras"

echo -e "${GREEN}✅ Despliegue completo de todos los servicios.${NC}"
