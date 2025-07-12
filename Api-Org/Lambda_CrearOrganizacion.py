import boto3
import os
import json
import logging
import urllib.request

logger = logging.getLogger()
logger.setLevel(logging.INFO)

FASTAPI_URL = "http://34.233.20.17:8080/crear-tenant"

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

        # Calcular puerto dinámicamente
        scan_response = t_org.scan(Select='COUNT')
        cantidad_orgs = scan_response.get('Count', 0)
        puerto = 9200 + cantidad_orgs

        logger.info(f"Puerto asignado para {tenant_id}: {puerto}")

        # Llamar a la API FastAPI para crear contenedor Elasticsearch
        data = json.dumps({
            'tenant_id': tenant_id,
            'puerto': puerto
        }).encode('utf-8')

        req = urllib.request.Request(
            FASTAPI_URL,
            data=data,
            headers={'Content-Type': 'application/json'},
            method='POST'
        )

        try:
            with urllib.request.urlopen(req) as response:
                fastapi_resp = response.read().decode('utf-8')
                logger.info(f"Respuesta de FastAPI: {fastapi_resp}")
        except urllib.error.HTTPError as e:
            error_detail = e.read().decode()
            logger.error(f"Error al crear tenant en FastAPI: {error_detail}")
            return {
                'statusCode': e.code,
                'body': json.dumps({
                    'error': 'Error al crear contenedor Elasticsearch',
                    'detalle': error_detail
                })
            }

        # Preparar el ítem para DynamoDB
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
            })
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
            })
        }
