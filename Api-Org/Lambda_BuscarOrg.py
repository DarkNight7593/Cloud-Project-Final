import boto3
import os
import json
import logging
from decimal import Decimal

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Función auxiliar para convertir Decimal a int o float
def json_serial(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    raise TypeError(f'Type {type(obj)} not serializable')

def lambda_handler(event, context):
    try:
        # Obtener tenant_id desde query parameters (GET)
        print("EVENT: ", json.dumps(event))  # O usa logger si prefieres

        tenant_id = event.get('query', {}).get('tenant_id')

        if not tenant_id:
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': 'Debe proporcionar tenant_id como parámetro en la URL (query string)'
                })
            }

        nombre_tabla = os.environ["TABLE_ORG"]

        # DynamoDB setup
        dynamodb = boto3.resource('dynamodb')
        tabla = dynamodb.Table(nombre_tabla)

        # Buscar organización
        response = tabla.get_item(Key={'tenant_id': tenant_id})

        if 'Item' not in response:
            return {
                'statusCode': 404,
                'body': json.dumps({
                    'error': f"No se encontró organización con tenant_id '{tenant_id}'"
                })
            }

        return {
            'statusCode': 200,
            'body': json.dumps(response['Item'], default=json_serial)
        }

    except Exception as e:
        logger.error("Error al buscar organización", exc_info=True)
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Error interno del servidor',
                'detalle': str(e)
            })
        }

