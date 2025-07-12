import boto3
import os
import json
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    try:
        # Asegurar que el body esté parseado si viene como string
        if isinstance(event['body'], str):
            event['body'] = json.loads(event['body'])

        body = event['body']
        tenant_id = body['tenant_id']
        token = body['token']

        if not tenant_id or not token:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Se requieren tenant_id y token'})
            }

        # Eliminar el token de la tabla
        dynamodb = boto3.resource('dynamodb')
        t_tokens = dynamodb.Table(os.environ["TABLE_TOKEN"])

        t_tokens.delete_item(
            Key={
                'tenant_id': tenant_id,
                'token': token
            }
        )

        logger.info(f"Logout exitoso para token {token} del tenant {tenant_id}")

        return {
            'statusCode': 200,
            'body': json.dumps({'message': 'Logout exitoso'})
        }

    except Exception as e:
        logger.error("Error inesperado en logout", exc_info=True)
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }
