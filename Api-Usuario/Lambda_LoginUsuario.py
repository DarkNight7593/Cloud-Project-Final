import boto3
import hashlib
import uuid
import os
import json
import logging
from datetime import datetime, timedelta, timezone

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Función para hashear contraseñas
def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

# Encabezados CORS comunes

def lambda_handler(event, context):
    try:
        # Manejo de preflight OPTIONS
        if event.get('httpMethod') == 'OPTIONS':
            return {
                'statusCode': 200,
                'body': json.dumps({'message': 'Preflight OK'})
            }

        # Parseo del cuerpo si es string
        if isinstance(event['body'], str):
            event['body'] = json.loads(event['body'])

        body = event['body']
        tenant_id = body.get('tenant_id')
        dni = body.get('dni')
        password = body.get('password')
        rol = body.get('rol', '').lower()

        if not all([tenant_id, dni, password, rol]):
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Faltan tenant_id, dni, password o rol'})
            }

        tenant_id_rol = f"{tenant_id}#{rol}"
        hashed_password = hash_password(password)

        dynamodb = boto3.resource('dynamodb')
        t_usuarios = dynamodb.Table(os.environ["TABLE_USER"])
        t_tokens = dynamodb.Table(os.environ["TABLE_TOKEN"])

        response = t_usuarios.get_item(
            Key={
                'tenant_id_rol': tenant_id_rol,
                'dni': dni
            }
        )

        if 'Item' not in response:
            return {
                'statusCode': 403,
                'body': json.dumps({'error': 'Usuario no existe o rol incorrecto'})
            }

        usuario = response['Item']
        if usuario['password'] != hashed_password:
            return {
                'statusCode': 403,
                'body': json.dumps({'error': 'Password incorrecto'})
            }

        token = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        expiracion = now + timedelta(hours=1)
        expiracion_str = expiracion.strftime('%Y-%m-%dT%H:%M:%SZ')

        full_name = usuario.get('full_name', '')

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

        logger.info(f"Login exitoso para {dni} en {tenant_id} con rol {rol}")

        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Login exitoso',
                'token': token,
                'expires_at': expiracion_str
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
