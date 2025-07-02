import boto3
import hashlib
import uuid
import os
import json
import logging
from datetime import datetime, timedelta

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def lambda_handler(event, context):
    try:
        # Parsear body si es string
        if isinstance(event['body'], str):
            event['body'] = json.loads(event['body'])

        tenant_id = event['body']['tenant_id']
        dni = event['body']['dni']
        password = event['body']['password']

        if not all([tenant_id, dni, password]):
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Faltan tenant_id, dni o password'})
            }

        hashed_password = hash_password(password)

        nombre_tabla_usuarios = os.environ["TABLE_USER"]
        nombre_tabla_tokens = os.environ["TABLE_TOKEN"]

        dynamodb = boto3.resource('dynamodb')
        t_usuarios = dynamodb.Table(nombre_tabla_usuarios)

        response = t_usuarios.get_item(
            Key={
                'tenant_id': tenant_id,
                'dni': dni
            }
        )

        if 'Item' not in response:
            return {
                'statusCode': 403,
                'body': json.dumps({'error': 'Usuario no existe'})
            }

        usuario = response['Item']

        if usuario['password'] != hashed_password:
            return {
                'statusCode': 403,
                'body': json.dumps({'error': 'Password incorrecto'})
            }

        # Generar token y guardar en DynamoDB
        token = str(uuid.uuid4())
        expiracion = datetime.now() + timedelta(hours=1)

        t_tokens = dynamodb.Table(nombre_tabla_tokens)
        t_tokens.put_item(
            Item={
                'tenant_id': tenant_id,
                'token': token,
                'dni': dni,
                'expires_at': expiracion.strftime('%Y-%m-%d %H:%M:%S')
            }
        )

        logger.info(f"Login exitoso para {dni} en {tenant_id}")

        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Login exitoso',
                'token': token,
                'expires_at': expiracion.strftime('%Y-%m-%d %H:%M:%S')
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


