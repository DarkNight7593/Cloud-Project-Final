import boto3
import os
import json
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

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

        # Armar el ítem con o sin 'detalle'
        item = {
            'tenant_id': tenant_id,
            'descripcion': descripcion,
            'correo': correo,
            'dominio': dominio
        }

        if detalle is not None:
            item['detalle'] = detalle  # Puede ser dict o string (según como lo pases)

        # Insertar en la tabla
        t_org.put_item(Item=item)

        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Organización registrada exitosamente',
                'tenant_id': tenant_id
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
