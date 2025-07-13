import boto3
import os
import logging
from datetime import datetime, timezone

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    try:
        # Asegurar que el body esté parseado
        if isinstance(event['body'], str):
            event['body'] = json.loads(event['body'])

        body = event['body']
        token = body.get('token')
        tenant_id = body.get('tenant_id')

        if not token or not tenant_id:
            return {
                'statusCode': 400,
                'body': {'error': 'Faltan token o tenant_id'}
            }

        table = boto3.resource('dynamodb').Table(os.environ["TABLE_TOKEN"])
        response = table.get_item(Key={'tenant_id': tenant_id, 'token': token})

        if 'Item' not in response:
            return {
                'statusCode': 403,
                'body': {'error': 'Token no existe'}
            }

        registro = response['Item']
        expires_str = registro['expires_at']
        expires = datetime.strptime(expires_str, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)

        if now > expires:
            return {
                'statusCode': 403,
                'body': {'error': 'Token expirado'}
            }

        return {
            'statusCode': 200,
            'body': {
                'message': 'Token válido',
                'dni': registro.get('dni'),
                'full_name': registro.get('full_name'),
                'rol': registro.get('rol'),
                'expires_at': expires_str
            }
        }

    except KeyError as e:
        logger.warning(f"Campo faltante: {str(e)}")
        return {
            'statusCode': 400,
            'body': {'error': f'Falta el campo requerido: {str(e)}'}
        }

    except Exception as e:
        logger.error("Error inesperado", exc_info=True)
        return {
            'statusCode': 500,
            'body': {'error': str(e)}
        }
