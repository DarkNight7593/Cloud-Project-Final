import boto3
from datetime import datetime
import os

def lambda_handler(event, context):
    try:
        # Entrada: token a validar
        token = event.get('token')
        if not token:
            return {
                'statusCode': 400,
                'body': {'error': 'Missing token in request'}
            }

        # Nombre de la tabla desde variable de entorno
        nombre_tabla_tokens = os.environ["TABLE_TOKEN"]
        dynamodb = boto3.resource('dynamodb')
        table = dynamodb.Table(nombre_tabla_tokens)

        # Buscar token en la tabla
        response = table.get_item(
            Key={
                'token': token
            }
        )

        # Si el token no existe
        if 'Item' not in response:
            return {
                'statusCode': 403,
                'body': {'error': 'Token no existe o es inválido'}
            }

        registro = response['Item']
        expires = registro['expires_at']
        now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        # Verificar si ha expirado
        if now > expires:
            return {
                'statusCode': 403,
                'body': {'error': 'Token expirado'}
            }

        # Retornar datos válidos del usuario/token
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
