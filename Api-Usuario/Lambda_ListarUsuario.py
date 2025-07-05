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
        token = event.get('headers', {}).get('Authorization')
        query_params = event.get('queryStringParameters')

        tenant_id = query_params.get('tenant_id')
        rol = query_params.get('rol')
        last_dni = query_params.get('last_dni')
        limit = int(query_params.get('limit', 10))

        if not token or not tenant_id:
            return {
                'statusCode': 403,
                'body': json.dumps({'error': 'Token y tenant_id son requeridos'})
            }

        if rol not in ['instructor', 'cliente']:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Parámetro rol requerido: instructor o cliente'})
            }

        # Validar token con tenant_id
        validar_response = lambda_client.invoke(
            FunctionName=FUNCION_VALIDAR,
            InvocationType='RequestResponse',
            Payload=json.dumps({'body': { 'token': token, 'tenant_id': tenant_id }})
        )

        payload = json.loads(validar_response['Payload'].read())
        if payload.get('statusCode') != 200:
            mensaje = 'Token inválido o expirado'
            try:
                mensaje = json.loads(payload.get('body')).get('error', mensaje)
            except:
                pass
            return {
                'statusCode': 403,
                'body': json.dumps({'error': mensaje})
            }

        usuario = payload.get('body', {})
        if isinstance(usuario, str):
            usuario = json.loads(usuario)

        if usuario.get('rol') != 'admin':
            return {
                'statusCode': 403,
                'body': json.dumps({'error': 'Solo administradores pueden listar usuarios'})
            }

        # Buscar usuarios
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
                'last_dni': last_dni_return
            })
        }

    except Exception as e:
        logger.error("Error inesperado", exc_info=True)
        return {
            'statusCode': 500,
            'body': json.dumps({'error': 'Error interno', 'detalle': str(e)})
        }
