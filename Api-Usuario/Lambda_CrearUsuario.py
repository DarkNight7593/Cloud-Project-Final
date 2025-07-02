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
        # Parsear body si es string
        if isinstance(event['body'], str):
            event['body'] = json.loads(event['body'])

        body = event['body']
        tenant_id = body['tenant_id']
        dni = body['dni']
        full_name = body['full_name']
        password = body['password']
        rol = body['rol'].lower()

        if not all([tenant_id, dni, full_name, password, rol]):
            return {
                'statusCode': 400,
                'headers': {'Content-Type': 'application/json'},
                'body': json.dumps({'error': 'Faltan tenant_id, dni, full_name, password o rol'})
            }

        # Validar token si se va a crear un instructor
        if rol == "instructor":
            if 'headers' not in event or 'Authorization' not in event['headers']:
                return {
                    'statusCode': 403,
                    'headers': {'Content-Type': 'application/json'},
                    'body': json.dumps({'error': 'Token requerido para crear un instructor'})
                }

            token = event['headers']['Authorization']
            lambda_client = boto3.client('lambda')
            FUNCION_VALIDAR = os.environ['FUNCION_VALIDAR']

            validacion = lambda_client.invoke(
                FunctionName=FUNCION_VALIDAR,
                InvocationType='RequestResponse',
                Payload=json.dumps({
                    'body': {
                        'token': token,
                        'tenant_id': tenant_id
                    }
                })
            )

            payload = json.loads(validacion['Payload'].read())
            if payload['statusCode'] != 200:
                return {
                    'statusCode': 403,
                    'headers': {'Content-Type': 'application/json'},
                    'body': json.dumps({'error': 'Token inválido o expirado'})
                }

            usuario_autenticado = json.loads(payload['body'])
            if usuario_autenticado['rol'] != 'admin':
                return {
                    'statusCode': 403,
                    'headers': {'Content-Type': 'application/json'},
                    'body': json.dumps({'error': 'Solo administradores pueden crear instructores'})
                }

        # Hashear y guardar
        hashed_password = hash_password(password)
        tabla = boto3.resource('dynamodb').Table(os.environ["TABLE_USER"])

        tabla.put_item(Item={
            'tenant_id': tenant_id,
            'dni': dni,
            'full_name': full_name,
            'rol': rol,
            'password': hashed_password
        })

        logger.info(f"Usuario registrado: {dni} ({rol}) en {tenant_id}")

        return {
            'statusCode': 200,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({
                'message': 'Usuario registrado exitosamente',
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
            'body': json.dumps({'error': f"Falta el campo requerido: {str(e)}"})
        }

    except Exception as e:
        logger.error("Error inesperado", exc_info=True)
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'application/json'},
            'body': json.dumps({
                'error': 'Error interno del servidor',
                'detalle': str(e)
            })
        }
