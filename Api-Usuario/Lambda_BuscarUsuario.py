import boto3
import os
import json
import logging
from decimal import Decimal

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
TABLE_USER = os.environ['TABLE_USER']

# ✅ Serializador para valores Decimal (de DynamoDB)
def json_serial(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    raise TypeError(f'Type {type(obj)} not serializable')

def lambda_handler(event, context):
    try:
        # ✅ Obtener parámetros desde query string (GET)
        query_params = event.get('query') or {}

        tenant_id = query_params.get('tenant_id')
        dni = query_params.get('dni')
        rol = query_params.get('rol', '').lower()

        # ❗ Verificación de campos obligatorios
        if not all([tenant_id, dni, rol]):
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Faltan tenant_id, dni o rol en la URL'})
            }

        tenant_id_rol = f"{tenant_id}#{rol}"
        tabla = dynamodb.Table(TABLE_USER)

        # 🔍 Buscar usuario
        response = tabla.get_item(
            Key={
                'tenant_id_rol': tenant_id_rol,
                'dni': dni
            }
        )

        if 'Item' not in response:
            return {
                'statusCode': 404,
                'body': json.dumps({'error': 'Usuario no encontrado'})
            }

        return {
            'statusCode': 200,
            'body': json.dumps(response['Item'], default=json_serial)
        }

    except Exception as e:
        logger.exception("Error inesperado en buscar_usuario")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': 'Error interno', 'detalle': str(e)})
        }
