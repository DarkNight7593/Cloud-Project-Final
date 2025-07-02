import boto3
import hashlib
import json
import os
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def lambda_handler(event, context):
    try:
        body = event['body']
        tenant_id = body['tenant_id']
        dni = body['dni']
        full_name = body['full_name']
        password = body['password']
        rol = body['rol'].lower()  # 'cliente', 'instructor', 'admin'

        if not all([tenant_id, dni, full_name, password]):
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': 'Faltan tenant_id, dni, full_name o password'
                })
            }
        
        # Hashear contraseña
        hashed_password = hash_password(password)

        # Insertar en DynamoDB
        nombre_tabla = os.environ["TABLE_USER"]
        dynamodb = boto3.resource('dynamodb')
        t_usuarios = dynamodb.Table(nombre_tabla)

        t_usuarios.put_item(
            Item={
                'tenant_id': tenant_id,
                'dni': dni,
                'full_name': full_name,
                'rol': rol,
                'password': hashed_password
            }
        )

        logger.info(f"Usuario registrado: {dni} - {tenant_id}")

        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Usuario registrado exitosamente',
                'nombre': full_name
            })
        }

    except KeyError as e:
        logger.warning(f"Campo faltante: {str(e)}")
        return {
            'statusCode': 400,
            'body': json.dumps({
                'error': f"Falta el campo requerido: {str(e)}"
            })
        }
    except Exception as e:
        logger.error("Error inesperado", exc_info=True)
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Error interno del servidor',
                'detalle': str(e)
            })
        }


