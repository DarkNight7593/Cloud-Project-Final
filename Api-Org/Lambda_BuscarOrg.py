import boto3
import os
import json
import logging
from decimal import Decimal

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    try:
        logger.info("EVENT: %s", json.dumps(event))

        # Leer tenant_id desde event.query (uso con integración Lambda)
        tenant_id = event.get('query', {}).get('tenant_id')

        if not tenant_id:
            return {
                'statusCode': 400,
                'body': {
                    'error': 'Debe proporcionar tenant_id como parámetro en la URL (query string)'
                }
            }

        nombre_tabla = os.environ["TABLE_ORG"]
        dynamodb = boto3.resource('dynamodb')
        tabla = dynamodb.Table(nombre_tabla)

        response = tabla.get_item(Key={'tenant_id': tenant_id})

        if 'Item' not in response:
            return {
                'statusCode': 404,
                'body': {
                    'error': f"No se encontró organización con tenant_id '{tenant_id}'"
                }
            }

        return {
            'statusCode': 200,
            'body': response['Item']  # No usar json.dumps
        }

    except Exception as e:
        logger.error("Error al buscar organización", exc_info=True)
        return {
            'statusCode': 500,
            'body': {
                'error': 'Error interno del servidor',
                'detalle': str(e)
            }
        }
