import boto3
import hashlib
import uuid
import os
from datetime import datetime, timedelta

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def lambda_handler(event, context):
    try:
        tenant_id = event.get('tenant_id')
        dni = event.get('dni')
        password = event.get('password')

        if not all([tenant_id, dni, password]):
            return {
                'statusCode': 400,
                'body': {'error': 'Missing tenant_id, dni, or password'}
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
                'body': {'error': 'Usuario no existe'}
            }

        usuario = response['Item']
        if usuario['password'] != hashed_password:
            return {
                'statusCode': 403,
                'body': {'error': 'Password incorrecto'}
            }

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

        return {
            'statusCode': 200,
            'body': {
                'message': 'Login exitoso',
                'token': token,
                'expires_at': expiracion.strftime('%Y-%m-%d %H:%M:%S')
            }
        }

    except Exception as e:
        print("Error:", str(e))
        return {
            'statusCode': 500,
            'body': {'error': str(e)}
        }

