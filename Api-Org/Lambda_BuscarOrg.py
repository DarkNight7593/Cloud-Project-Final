import boto3
import os
import json
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    try:
        body = event['body']  # Estilo estricto

        tenant_id = body['tenant_id']
        nombre_tabla = os.environ["TABLE_ORG"]

        # DynamoDB setup
        dynamodb = boto3.resource('dynamodb')
        tabla = dynamodb.Table(nombre_tabla)

        # Buscar organización
        response = tabla.get_item(Key={'tenant_id': tenant_id})

        if 'Item' not in response:
            return {
                'statusCode': 404,
                'body': json.dumps({
                    'error': f"No se encontró organización con tenant_id '{tenant_id}'"
                })
            }

        return {
            'statusCode': 200,
            'body': json.dumps(response['Item'])
        }

    except KeyError as e:
        return {
            'statusCode': 400,
            'body': json.dumps({
                'error': f"Falta el campo requerido en el body: {str(e)}"
            })
        }
    except Exception as e:
        logger.error("Error al buscar organización", exc_info=True)
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Error interno del servidor',
                'detalle': str(e)
            })
        }
