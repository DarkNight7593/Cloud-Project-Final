import boto3
import os
import logging
from decimal import Decimal

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def json_serial(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    raise TypeError(f'Type {type(obj)} not serializable')

def lambda_handler(event, context):
    try:
        nombre_tabla = os.environ["TABLE_ORG"]
        dynamodb = boto3.resource("dynamodb")
        tabla = dynamodb.Table(nombre_tabla)

        response = tabla.scan()
        items = response.get("Items", [])

        return {
            "statusCode": 200,
            "body": {
                "organizaciones": items,
                "total": len(items)
            }
        }

    except Exception as e:
        logger.error("Error inesperado en listar organizaciones", exc_info=True)
        return {
            "statusCode": 500,
            "body": {
                "error": "Error interno del servidor",
                "detalle": str(e)
            }
        }
