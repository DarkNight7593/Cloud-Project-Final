import boto3
import os
import json
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    try:
        # Acceso directo a campos
        tenant_id = event['body']['tenant_id']
        domain = event['body']['domain']
        descripcion = event['body']['descripcion']
        correo = event['body']['correo']
        nombre_tabla = os.environ["TABLE_ORG"]

        # Validar que no estén vacíos
        if not all([tenant_id, domain, descripcion, correo]):
            return {
                'statusCode': 400,
                'body': json.dumps({
                    'error': 'Faltan uno o más campos: tenant_id, domain, descripcion, correo'
                })
            }

        # Insertar en la tabla DynamoDB
        dynamodb = boto3.resource('dynamodb')
        t_org = dynamodb.Table(nombre_tabla)

        t_org.put_item(
            Item={
                'tenant_id': tenant_id,
                'descripcion': descripcion,
                'correo': correo,
                'domain': domain
            }
        )

        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Org registered successfully',
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

    