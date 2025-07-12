import boto3
import os
import json
import logging
from decimal import Decimal
from boto3.dynamodb.conditions import Key

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
lambda_client = boto3.client('lambda')

TABLE_USER = os.environ['TABLE_USER']
FUNCION_VALIDAR = os.environ['FUNCION_VALIDAR']

# ✅ Serializador para valores Decimal
def json_serial(obj):
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    raise TypeError(f'Type {type(obj)} not serializable')

def lambda_handler(event, context):
    try:
        token = event['headers']['Authorization']

        # Asegurarse de que body existe
        if 'body' not in event or event['body'] is None:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Falta el body'})
            }

        # Parsear body si es string
        if isinstance(event['body'], str):
            body = json.loads(event['body'])
        else:
            body = event['body']

        tenant_id = body['tenant_id']
        rol = body['rol'].lower()
        last_dni = body.get('last_dni')
        try:
            limit = int(body['limit'])
        except (KeyError, ValueError, TypeError):
            limit = 5

        if not token or not tenant_id:
            return {
                'statusCode': 404,
                'body': json.dumps({'error': 'Token y tenant_id son requeridos'})
            }

        if rol not in ['instructor', 'alumno']:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Parámetro rol requerido: instructor o alumno'})
            }

        # Validar token con tenant_id
        validar_response = lambda_client.invoke(
            FunctionName=FUNCION_VALIDAR,
            InvocationType='RequestResponse',
            Payload=json.dumps({'body': {'token': token, 'tenant_id': tenant_id}})
        )

        payload = json.loads(validar_response['Payload'].read())
        if payload['statusCode'] != 200:
            mensaje = 'Token inválido o expirado'
            try:
                mensaje = json.loads(payload['body'])['error']
            except:
                pass
            return {
                'statusCode': 403,
                'body': json.dumps({'error': mensaje})
            }

        usuario = payload['body']
        if isinstance(usuario, str):
            usuario = json.loads(usuario)

        if usuario['rol'].lower() != 'admin':
            return {
                'statusCode': 404,
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

        items = result['Items']
        last_dni_return = items[-1]['dni'] if items else None

        return {
            'statusCode': 200,
            'body': json.dumps({
                'usuarios': items,
                'last_dni': last_dni_return
            }, default=json_serial)
        }

    except KeyError as ke:
        logger.error(f"Falta campo requerido: {ke}", exc_info=True)
        return {
            'statusCode': 400,
            'body': json.dumps({'error': f'Falta campo requerido: {str(ke)}'})
        }
    except Exception as e:
        logger.error("Error inesperado", exc_info=True)
        return {
            'statusCode': 500,
            'body': json.dumps({'error': 'Error interno', 'detalle': str(e)})
        }
