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

        if isinstance(event['body'], str):
            event['body'] = json.loads(event['body'])

        body = event['body']
        tenant_id = body['tenant_id']
        dni = body['dni']
        full_name = body['full_name']
        password = body['password']
        rol = body['rol'].lower()
        detalles = body.get('detalles')  # 👈 campo opcional

        if not all([tenant_id, dni, full_name, password, rol]):
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Faltan tenant_id, dni, full_name, password o rol'})
            }

        # 🔍 1️⃣ Validar tenant usando Lambda externo
        lambda_client = boto3.client('lambda')
        FUNCION_ORG = os.environ['FUNCION_ORG']

        buscar_org_resp = lambda_client.invoke(
            FunctionName=FUNCION_ORG,
            InvocationType='RequestResponse',
            Payload=json.dumps({
                'query': {
                    'tenant_id': tenant_id
                }
            })
        )

        buscar_org_payload = json.loads(buscar_org_resp['Payload'].read())
        if buscar_org_payload.get('statusCode') != 200:
            return {
                'statusCode': 404,
                'body': json.dumps({'error': f'Tenant "{tenant_id}" no está registrado'})
            }

        # ⚙️ Preparar tabla de usuarios
        dynamodb = boto3.resource('dynamodb')
        tabla_usuarios = dynamodb.Table(os.environ["TABLE_USER"])
        tenant_id_rol = f"{tenant_id}#{rol}"




        # 🚫 2️⃣ Validar que solo exista un admin por tenant
        if rol == "admin":
            resp = tabla_usuarios.query(
                KeyConditionExpression=boto3.dynamodb.conditions.Key('tenant_id_rol').eq(tenant_id_rol),
                Limit=1
            )
            if resp.get('Items'):
                return {
                    'statusCode': 409,
                    'body': json.dumps({'error': 'Ya existe un administrador registrado para este tenant'})
                }

        # ✅ 3️⃣ Validar token si se intenta crear un instructor
        if rol == "instructor":
            token = event.get('headers', {}).get('Authorization')
            if not token:
                return {
                    'statusCode': 404,
                    'body': json.dumps({'error': 'Token requerido para crear un instructor'})
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
                    'body': json.dumps({'error': 'Token inválido o expirado'})
                }

            usuario_autenticado = json.loads(payload['body']) if isinstance(payload['body'], str) else payload['body']
            if usuario_autenticado.get('rol') != 'admin':
                return {
                    'statusCode': 401,
                    'body': json.dumps({'error': 'Solo administradores pueden crear instructores'})
                }

        # 📝 4️⃣ Registrar usuario
        hashed_password = hash_password(password)
        item = {
            'tenant_id_rol': tenant_id_rol,
            'dni': dni,
            'full_name': full_name,
            'rol': rol,
            'password': hashed_password
        }

        # ➕ Agregar campo opcional detalles si está presente y es un objeto
        if detalles is not None:
            if not isinstance(detalles, dict):
                return {
                    'statusCode': 400,
                    'body': json.dumps({'error': 'El campo "detalles" debe ser un objeto JSON'})
                }
            item['detalles'] = detalles




        tabla_usuarios.put_item(Item=item)
        logger.info(f"Usuario registrado: {dni} ({rol}) en {tenant_id}")

        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Usuario registrado exitosamente',
                'dni': dni,
                'full_name': full_name,
                'rol': rol,
                'detalles': detalles if detalles else {}
            })
        }

    except KeyError as e:
        logger.warning(f"Campo faltante: {str(e)}")
        return {
            'statusCode': 400,
            'body': json.dumps({'error': f"Falta el campo requerido: {str(e)}"})
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