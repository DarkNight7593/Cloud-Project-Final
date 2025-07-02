import boto3
from datetime import datetime
import os
import json
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    try:
        # Asegurar que el body esté parseado
        if isinstance(event['body'], str):
            event['body'] = json.loads(event['body'])

        token = event['body']['token']
        tenant_id = event['body']['tenant_id']

        if not token or not tenant_id:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Faltan token o tenant_id'})
            }

        nombre_tabla_tokens = os.environ["TABLE_TOKEN"]
        dynamodb = boto3.resource('dynamodb')
        table = dynamodb.Table(nombre_tabla_tokens)

        response = table.get_item(
            Key={
                'tenant_id': tenant_id,
                'token': token
            }
        )

        if 'Item' not in response:
            return {
                'statusCode': 403,
                'body': json.dumps({'error': 'Token no existe o es inválido'})
            }

        registro = response['Item']
        expires_str = registro['expires_at']
        expires = datetime.strptime(expires_str, '%Y-%m-%d %H:%M:%S')
        now = datetime.now()

        if now > expires:
            return {
                'statusCode': 403,
                'body': json.dumps({'error': 'Token expirado'})
            }

        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Token válido',
                'tenant_id': registro['tenant_id'],
                'dni': registro['dni'],
                "rol":registro['rol'],
                'expires_at': expires_str
            })
        }

    except KeyError as e:
        logger.warning(f"Campo faltante: {str(e)}")
        return {
            'statusCode': 400,
            'body': json.dumps({'error': f'Falta el campo requerido: {str(e)}'})
        }

    except Exception as e:
        logger.error("Error inesperado", exc_info=True)
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }
