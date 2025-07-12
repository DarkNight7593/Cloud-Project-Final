import boto3
import os
import json
import logging
import urllib.request
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
                'body': json.dumps({
                    'error': 'Faltan uno o más campos requeridos: tenant_id, dominio, descripcion, correo'
                })
            }

        nombre_tabla = os.environ["TABLE_ORG"]
        dynamodb = boto3.resource('dynamodb')
        t_org = dynamodb.Table(nombre_tabla)

        # Verificar si ya existe el tenant_id
        respuesta = t_org.get_item(Key={'tenant_id': tenant_id})
        if 'Item' in respuesta:
            return {
                'statusCode': 409,
                'body': json.dumps({
                    'error': f"Ya existe una organización con tenant_id '{tenant_id}'"
                })
            }

        # Calcular puerto dinámico
        scan_response = t_org.scan(Select='COUNT')
        cantidad_orgs = scan_response.get('Count', 0)
        puerto = 9200 + int(cantidad_orgs)

        logger.info(f"Puerto asignado para {tenant_id}: {puerto}")
        
        # Crear item para DynamoDB
        item = {
            'tenant_id': tenant_id,
            'descripcion': descripcion,
            'correo': correo,
            'dominio': dominio,
            'puerto': puerto
        }

        if detalle is not None:
            item['detalle'] = detalle

        # Guardar en DynamoDB
        t_org.put_item(Item=item)

        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Organización registrada exitosamente',
                'tenant_id': tenant_id,
                'puerto': puerto
            }, default=json_serial)
        }

    except KeyError as e:
        logger.warning(f"Campo faltante: {str(e)}")
        return {
            'statusCode': 400,
            'body': json.dumps({
                'error': f"Campo faltante en el body: {str(e)}"
            })
        }
    except Exception as e:
        logger.error("Excepción inesperada", exc_info=True)
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Error interno del servidor',
                'detalle': str(e)
            }, default=json_serial)
        }

