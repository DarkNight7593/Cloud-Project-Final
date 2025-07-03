import boto3
import os
import json
import logging
from boto3.dynamodb.conditions import Key

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
lambda_client = boto3.client('lambda')

TABLE_USER = os.environ['TABLE_USER']
FUNCION_VALIDAR = os.environ['FUNCION_VALIDAR']

def lambda_handler(event, context):
    try:
        headers = event.get('headers', {})
        token = headers.get('Authorization')
        if not token:
            return {
                'statusCode': 403,
                'body': json.dumps({'error': 'Token no proporcionado'})
            }

        # Validar token
        response = lambda_client.invoke(
            FunctionName=FUNCION_VALIDAR,
            InvocationType='RequestResponse',
            Payload=json.dumps({'token': token})
        )
        payload = json.loads(response['Payload'].read())
        if payload.get('statusCode') != 200:
            return {
                'statusCode': 403,
                'body': json.dumps({'error': 'Token inválido o expirado'})
            }

        usuario = payload.get('body', {})
        if isinstance(usuario, str):
            usuario = json.loads(usuario)

        if usuario.get('rol') != 'admin':
            return {
                'statusCode': 403,
                'body': json.dumps({'error': 'Solo administradores pueden listar usuarios'})
            }

        tenant_id = usuario['tenant_id']
        query_params = event.get('queryStringParameters') or {}
        rol = query_params.get('rol')
        if rol not in ['instructor', 'cliente']:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Parámetro rol requerido: instructor o cliente'})
            }

        limit = int(query_params.get('limit', 10))
        last_dni = query_params.get('last_dni')  # opcional

        partition_key = f"{tenant_id}#{rol}"

        condition = Key('tenant_id_rol').eq(partition_key)
        if last_dni:
            condition &= Key('dni').gt(last_dni)

        tabla = dynamodb.Table(TABLE_USER)
        result = tabla.query(
            KeyConditionExpression=condition,
            Limit=limit
        )

        items = result.get('Items', [])
        last_dni_return = items[-1]['dni'] if items else None

        return {
            'statusCode': 200,
            'body': json.dumps({
                'usuarios': items,
                'last_dni': last_dni_return  # para próxima página
            })
        }

    except Exception as e:
        logger.error("Error inesperado", exc_info=True)
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }
