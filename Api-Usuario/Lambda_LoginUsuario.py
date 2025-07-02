import boto3
import hashlib
import uuid
import os
import json
import logging
from datetime import datetime, timedelta, timezone

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def lambda_handler(event, context):
    try:
        # Asegurar que el body esté parseado
        if isinstance(event['body'], str):
            event['body'] = json.loads(event['body'])

        # Acceso directo como indicaste
        tenant_id = event['body']['tenant_id']
        dni = event['body']['dni']
        password = event['body']['password']

        if not tenant_id or not dni or not password:
            return {
                'statusCode': 400,
                'headers': {'Content-Type': 'application/json'},
                'body': json.dumps({'error': 'Faltan tenant_id, dni o password'})
            }

        hashed_password = hash_password(password)

        dynamodb = boto3.resource('dynamodb')
        t_usuarios = dynamodb.Table(os.environ["TABLE_USER"])
        t_tokens = dynamodb.Table(os.environ["TABLE_TOKEN"])

        response = t_usuarios.get_item(
            Key={'tenant_id': tenant_id, 'dni': dni}
        )

        if 'Item' not in response:
            return {
                'statusCode': 403,
                'headers': {'Content-Type': 'application/json'},
                'body': json.dumps({'error': 'Usuario no existe'})
            }

        usuario = response['Item']
        if usuario['password'] != hashed_password:
            return {
                'statusCode': 403,
                'headers': {'Content-Type': 'application/json'},
                'body': json.dumps({'error': 'Password incorrecto'})
            }

        # Generar token y guardar con expiración UTC
        token = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        expiracion = now + timedelta(hours=1)
        expiracion_str = expiracion.strftime('%Y-%m-%dT%H:%M:%SZ')  # formato ISO UTC

        full_name = usuario.get('full_name', '')
        rol = usuario.get('rol', '')

        t_tokens.put_item(
            Item={
                'tenant_id': tenant_id,
                'token': token,
                'dni': dni,
                'full_name': full_name,
                'rol': rol,
                'expires_at': expiracion_str
            }
        )

        logger.info(f"Login exitoso para {dni} en {tenant_id}")

        return {
            'statusCode': 200,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({
                'message': 'Login exitoso',
                'token': token,
                'expires_at': expiracion_str,
                'dni': dni,
                'full_name': full_name,
                'rol': rol
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
