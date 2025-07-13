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
        token = event['headers'].get('Authorization')

        # Verificar que body existe
        if 'body' not in event or event['body'] is None:
            return {
                'statusCode': 400,
                'body': {'error': 'Falta el body'}
            }

        # Parsear body si es string
        body = json.loads(event['body']) if isinstance(event['body'], str) else event['body']

        tenant_id = body.get('tenant_id')
        rol = body.get('rol', '').lower()
        last_dni = body.get('last_dni')
        try:
            limit = int(body.get('limit', 5))
        except (ValueError, TypeError):
            limit = 5

        if not token or not tenant_id:
            return {
                'statusCode': 404,
                'body': {'error': 'Token y tenant_id son requeridos'}
            }

        if rol not in ['instructor', 'alumno']:
            return {
                'statusCode': 400,
                'body': {'error': 'Parámetro rol requerido: instructor o alumno'}
            }

        # Validar token con Lambda externa
        validar_response = lambda_client.invoke(
            FunctionName=FUNCION_VALIDAR,
            InvocationType='RequestResponse',
            Payload=json.dumps({'body': {'token': token, 'tenant_id': tenant_id}})
        )
        payload = json.loads(validar_response['Payload'].read())
        if payload.get('statusCode') != 200:
            mensaje = 'Token inválido o expirado'
            try:
                mensaje = json.loads(payload['body'])['error']
            except Exception:
                pass
            return {
                'statusCode': 403,
                'body': {'error': mensaje}
            }

        usuario = json.loads(payload['body']) if isinstance(payload['body'], str) else payload['body']
        if usuario.get('rol', '').lower() != 'admin':
            return {
                'statusCode': 404,
                'body': {'error': 'Solo administradores pueden listar usuarios'}
            }

        # Consulta a DynamoDB
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
            'body': {
                'usuarios': items,
                'last_dni': last_dni_return
            }
        }

    except KeyError as ke:
        logger.error(f"Falta campo requerido: {ke}", exc_info=True)
        return {
            'statusCode': 400,
            'body': {'error': f'Falta campo requerido: {str(ke)}'}
        }

    except Exception as e:
        logger.error("Error inesperado", exc_info=True)
        return {
            'statusCode': 500,
            'body': {'error': 'Error interno', 'detalle': str(e)}
        }
