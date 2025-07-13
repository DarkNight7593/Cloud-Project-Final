import boto3
import os
import logging
from decimal import Decimal

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
TABLE_USER = os.environ['TABLE_USER']

def lambda_handler(event, context):
    try:
        query = event.get('query') or {}

        tenant_id = query.get('tenant_id')
        dni = query.get('dni')
        rol = query.get('rol', '').lower()

        if not all([tenant_id, dni, rol]):
            return {
                'statusCode': 400,
                'body': {'error': 'Faltan tenant_id, dni o rol en la URL'}
            }

        tabla = dynamodb.Table(TABLE_USER)
        response = tabla.get_item(
            Key={
                'tenant_id_rol': f"{tenant_id}#{rol}",
                'dni': dni
            }
        )

        if 'Item' not in response:
            return {
                'statusCode': 404,
                'body': {'error': 'Usuario no encontrado'}
            }

        return {
            'statusCode': 200,
            'body': response['Item']
        }

    except Exception as e:
        logger.exception("Error inesperado en buscar_usuario")
        return {
            'statusCode': 500,
            'body': {'error': 'Error interno', 'detalle': str(e)}
        }
