import boto3
import os
import json
import logging
import requests
from decimal import Decimal

logger = logging.getLogger()
logger.setLevel(logging.INFO)

FASTAPI_URL = "http://34.233.20.17:8080/crear-tenant"

def json_serial(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    raise TypeError(f"Type {type(obj)} not serializable")

def lambda_handler(event, context):
    try:
        # Obtener el body como dict
        body = event.get('body')
        if isinstance(body, str):
            body = json.loads(body)

        tenant_id = body.get('tenant_id')
        dominio = body.get('dominio')
        descripcion = body.get('descripcion')
        correo = body.get('correo')
        detalle = body.get('detalle')  # opcional

        if not all([tenant_id, dominio, descripcion, correo]):
            return {
                'statusCode': 400,
                'body': {
                    'error': 'Faltan uno o más campos requeridos: tenant_id, dominio, descripcion, correo'
                }
            }

        # Inicializar recursos
        nombre_tabla = os.environ["TABLE_ORG"]
        dynamodb = boto3.resource('dynamodb')
        t_org = dynamodb.Table(nombre_tabla)

        # Validar que no exista
        if 'Item' in t_org.get_item(Key={'tenant_id': tenant_id}):
            return {
                'statusCode': 409,
                'body': {
                    'error': f"Ya existe una organización con tenant_id '{tenant_id}'"
                }
            }

        # Asignar puerto dinámicamente
        scan_response = t_org.scan(Select='COUNT')
        cantidad_orgs = scan_response.get('Count', 0)
        puerto = 9200 + int(cantidad_orgs)

        logger.info(f"Puerto asignado para {tenant_id}: {puerto}")

        # Crear item en DynamoDB
        item = {
            'tenant_id': tenant_id,
            'descripcion': descripcion,
            'correo': correo,
            'dominio': dominio,
            'puerto': puerto
        }
        if detalle is not None:
            item['detalle'] = detalle

        t_org.put_item(Item=item)

        # 🔄 Intentar llamada a FastAPI
        try:
            fastapi_response = requests.post(
                FASTAPI_URL,
                json={ "tenant": tenant_id, "puerto": puerto },
                timeout=10  # solo para detectar errores inmediatos
            )

            if fastapi_response.status_code not in [200]:
                logger.warning(f"FastAPI respondió con código inesperado: {fastapi_response.status_code}")
                logger.warning(f"Respuesta: {fastapi_response.text}")
                # pero no fallamos; asumimos que se levantará más adelante
        except requests.exceptions.RequestException as fastapi_err:
            logger.warning(f"No se obtuvo respuesta inmediata de FastAPI: {fastapi_err}")
            # asumimos que sigue ejecutándose o se levantará luego

        return {
            'statusCode': 200,
            'body': {
                'message': 'Organización registrada (FastAPI puede tardar en completar)',
                'tenant_id': tenant_id,
                'puerto': puerto
            }
        }

    except KeyError as e:
        logger.warning(f"Campo faltante: {str(e)}")
        return {
            'statusCode': 400,
            'body': { 'error': f"Campo faltante en el body: {str(e)}" }
        }
    except Exception as e:
        logger.error("Excepción inesperada", exc_info=True)
        return {
            'statusCode': 500,
            'body': {
                'error': 'Error interno del servidor',
                'detalle': str(e)
            }
        }
