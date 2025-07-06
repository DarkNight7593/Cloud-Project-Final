import boto3
import os
import json
import logging
from boto3.dynamodb.conditions import Key, Attr

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    try:

        nombre_tabla = os.environ["TABLE_ORG"]
        dynamodb = boto3.resource("dynamodb")
        tabla = dynamodb.Table(nombre_tabla)

        response = tabla.scan()

        return {
            "statusCode": 200,
            "body": json.dumps({
                "organizaciones": response.get("Items", []),
                "total": len(response.get("Items", []))
            })
        }

    except Exception as e:
        logger.error("Error inesperado en listar organizaciones", exc_info=True)
        return {
            "statusCode": 500,
            "body": json.dumps({
                "error": "Error interno del servidor",
                "detalle": str(e)
            })
        }
