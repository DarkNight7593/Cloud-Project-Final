import boto3
import hashlib
import os
import logging
import json

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def lambda_handler(event, context):
    try:
        if isinstance(event['body'], str):
            event['body'] = json.loads(event['body'])

        body = event['body']
        tenant_id = body['tenant_id']
        dni = body['dni']
        full_name = body['full_name']
        password = body['password']
        rol = body['rol'].lower()
        detalles = body.get('detalles')  # opcional

        if not all([tenant_id, dni, full_name, password, rol]):
            return {
                'statusCode': 400,
                'body': {'error': 'Faltan tenant_id, dni, full_name, password o rol'}
            }

        lambda_client = boto3.client('lambda')
        FUNCION_ORG = os.environ['FUNCION_ORG']

        # ✅ Invocar Lambda FUNCION_ORG con integration tipo lambda (query como objeto)
        buscar_org_resp = lambda_client.invoke(
            FunctionName=FUNCION_ORG,
            InvocationType='RequestResponse',
            Payload=json.dumps({
                'query': {'tenant_id': tenant_id}
            })
        )
        buscar_org_payload = json.loads(buscar_org_resp['Payload'].read())

        if buscar_org_payload.get('statusCode') != 200:
            return {
                'statusCode': 404,
                'body': {'error': f'Tenant "{tenant_id}" no está registrado'}
            }

        tabla_usuarios = boto3.resource('dynamodb').Table(os.environ["TABLE_USER"])
        tenant_id_rol = f"{tenant_id}#{rol}"

        # Validar que solo haya un admin por tenant
        if rol == "admin":
            resp = tabla_usuarios.query(
                KeyConditionExpression=boto3.dynamodb.conditions.Key('tenant_id_rol').eq(tenant_id_rol),
                Limit=1
            )
            if resp.get('Items'):
                return {
                    'statusCode': 409,
                    'body': {'error': 'Ya existe un administrador registrado para este tenant'}
                }

        # Validar token si se crea un instructor
        if rol == "instructor":
            token = event.get('headers', {}).get('Authorization')
            if not token:
                return {
                    'statusCode': 403,
                    'body': {'error': 'Token requerido para crear un instructor'}
                }

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

            if payload.get('statusCode') != 200:
                return {
                    'statusCode': 403,
                    'body': {'error': 'Token inválido o expirado'}
                }

            usuario_autenticado = payload['body']  # ✅ ya es un objeto
            if usuario_autenticado.get('rol') != 'admin':
                return {
                    'statusCode': 401,
                    'body': {'error': 'Solo administradores pueden crear instructores'}
                }

        # Registrar usuario
        hashed_password = hash_password(password)
        item = {
            'tenant_id_rol': tenant_id_rol,
            'dni': dni,
            'full_name': full_name,
            'rol': rol,
            'password': hashed_password
        }

        if detalles is not None:
            if not isinstance(detalles, dict):
                return {
                    'statusCode': 400,
                    'body': {'error': 'El campo "detalles" debe ser un objeto JSON'}
                }
            item['detalles'] = detalles

        tabla_usuarios.put_item(Item=item)
        logger.info(f"Usuario registrado: {dni} ({rol}) en {tenant_id}")

        return {
            'statusCode': 200,
            'body': {
                'message': 'Usuario registrado exitosamente',
                'dni': dni,
                'full_name': full_name,
                'rol': rol,
                'detalles': detalles if detalles else {}
            }
        }

    except KeyError as e:
        return {
            'statusCode': 400,
            'body': {'error': f"Falta el campo requerido: {str(e)}"}
        }

    except Exception as e:
        logger.error("Error inesperado", exc_info=True)
        return {
            'statusCode': 500,
            'body': {'error': 'Error interno del servidor', 'detalle': str(e)}
        }
