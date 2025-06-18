import boto3
from datetime import datetime
import os

def lambda_handler(event, context):
    try:
        token = event.get('token')
        tenant_id = event.get('tenant_id')

        if not token or not tenant_id:
            return {
                'statusCode': 400,
                'body': {'error': 'Missing token or tenant_id'}
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
                'body': {'error': 'Token no existe o es inválido'}
            }

        registro = response['Item']
        expires = registro['expires_at']
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        if now > expires:
            return {
                'statusCode': 403,
                'body': {'error': 'Token expirado'}
            }

        return {
            'statusCode': 200,
            'body': {
                'message': 'Token válido',
                'tenant_id': registro.get('tenant_id'),
                'dni': registro.get('dni'),
                'expires_at': expires
            }
        }

    except Exception as e:
        print("Error:", str(e))
        return {
            'statusCode': 500,
            'body': {'error': str(e)}
        }
