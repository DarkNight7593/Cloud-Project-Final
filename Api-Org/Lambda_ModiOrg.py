import boto3
import os
import json
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    try:
        # 1. Extraer headers y body (todo con [])
        token = event['headers']['Authorization']
        body = event['body']

        tenant_id = body['tenant_id']
        if not token or not tenant_id:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'Faltan token o tenant_id'})
            }

        # 2. Validar token
        lambda_client = boto3.client('lambda')
        funcion_validar = os.environ['FUNCION_VALIDAR']

        validar_resp = lambda_client.invoke(
            FunctionName=funcion_validar,
            InvocationType='RequestResponse',
            Payload=json.dumps({
                'body': {
                    'token': token,
                    'tenant_id': tenant_id
                }
            })
        )

        validar_payload = json.loads(validar_resp['Payload'].read())
        if validar_payload.get('statusCode') != 200:
            return {
                'statusCode': validar_payload.get('statusCode', 403),
                'body': json.dumps({
                    'error': 'Token inválido o expirado'
                })
            }

        user_info = json.loads(validar_payload['body'])
        if user_info['rol'] != 'admin':
            return {
                'statusCode': 403,
                'body': json.dumps({'error': 'Solo un administrador puede modificar la organización'})
            }

        # 3. Verificar si la organización existe
        dynamodb = boto3.resource('dynamodb')
        tabla = dynamodb.Table(os.environ["TABLE_ORG"])

        existe = tabla.get_item(Key={'tenant_id': tenant_id})
        if 'Item' not in existe:
            return {
                'statusCode': 404,
                'body': json.dumps({'error': f"No existe organización con tenant_id '{tenant_id}'"})
            }

        # 4. Preparar actualización con los campos permitidos
        campos_permitidos = ['domain', 'descripcion', 'correo']
        update_expr = []
        expr_values = {}

        for campo in campos_permitidos:
            if campo in body:
                update_expr.append(f"{campo} = :{campo[0]}")
                expr_values[f":{campo[0]}"] = body[campo]

        if not update_expr:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': 'No se proporcionaron campos para actualizar'})
            }

        update_expression = "SET " + ", ".join(update_expr)

        tabla.update_item(
            Key={'tenant_id': tenant_id},
            UpdateExpression=update_expression,
            ExpressionAttributeValues=expr_values
        )

        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Organización actualizada correctamente',
                'tenant_id': tenant_id,
                'actualizados': list(expr_values.keys())
            })
        }

    except KeyError as e:
        return {
            'statusCode': 400,
            'body': json.dumps({'error': f"Campo faltante: {str(e)}"})
        }
    except Exception as e:
        logger.error("Error inesperado en modificar organización", exc_info=True)
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': 'Error interno del servidor',
                'detalle': str(e)
            })
        }

