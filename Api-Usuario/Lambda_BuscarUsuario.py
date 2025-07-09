import boto3
import os
import json
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
TABLE_USER = os.environ['TABLE_USER']

def lambda_handler(event, context):
    try:
        # Parsear body si es string
        if isinstance(event['body'], str):
            body = json.loads(event['body'])
        else:
            body = event['body']

        tenant_id = body.get('tenant_id')
        dni = body.get('dni')
        rol = body.get('rol', '').lower()

        if not all([tenant_id, dni, rol]):
            return {
                'statusCode': 400,
                'headers': {'Content-Type': 'application/json'},
                'body': json.dumps({'error': 'Faltan tenant_id, dni o rol'})
            }

        tenant_id_rol = f"{tenant_id}#{rol}"
        tabla = dynamodb.Table(TABLE_USER)

        response = tabla.get_item(
            Key={
                'tenant_id_rol': tenant_id_rol,
                'dni': dni
            }
        )

        if 'Item' not in response:
            return {
                'statusCode': 404,
                'headers': {'Content-Type': 'application/json'},
                'body': json.dumps({'error': 'Usuario no encontrado'})
            }

        return {
            'statusCode': 200,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps(response['Item'])
        }

    except Exception as e:
        logger.exception("Error inesperado en buscar_usuario")
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'error': 'Error interno', 'detalle': str(e)})
        }
