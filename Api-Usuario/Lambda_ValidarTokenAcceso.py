import boto3
import os
import json
import logging
from datetime import datetime, timezone

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
                'headers': {'Content-Type': 'application/json'},
                'body': json.dumps({'error': 'Faltan token o tenant_id'})
            }

        table_name = os.environ["TABLE_TOKEN"]
        dynamodb = boto3.resource('dynamodb')
        table = dynamodb.Table(table_name)

        response = table.get_item(
            Key={'tenant_id': tenant_id, 'token': token}
        )

        if 'Item' not in response:
            return {
                'statusCode': 400,
                'headers': {'Content-Type': 'application/json'},
                'body': json.dumps({'error': 'Token no existe'})
            }

        registro = response['Item']
        expires_str = registro['expires_at']
        expires = datetime.strptime(expires_str, '%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=timezone.utc)
        now = datetime.now(timezone.utc)

        if now > expires:
            return {
                'statusCode': 403,
                'headers': {'Content-Type': 'application/json'},
                'body': json.dumps({'error': 'Token expirado'})
            }

        return {
            'statusCode': 200,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({
                'message': 'Token válido',
                'dni': registro.get('dni'),
                'full_name': registro.get('full_name'),
                'rol': registro.get('rol'),
                'expires_at': expires_str
            })
        }

    except KeyError as e:
        logger.warning(f"Campo faltante: {str(e)}")
        return {
            'statusCode': 400,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'error': f'Falta el campo requerido: {str(e)}'})
        }

    except Exception as e:
        logger.error("Error inesperado", exc_info=True)
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({'error': str(e)})
        }
