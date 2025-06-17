import boto3
import hashlib
import os

# Hashear contraseña
def hash_password(password):
    # Retorna la contraseña hasheada
    return hashlib.sha256(password.encode()).hexdigest()

# Función que maneja el registro de user y validación del password
def lambda_handler(event, context):
    try:
        # Obtener datos
        tenant_id = event.get('tenant_id')
        domain = event.get('domain')
        descripcion = event.get("descripcion")
        correo = event.get('correo')
        nombre_tabla = os.environ["TABLE_ORG"]
        
        # Verificar que el email y el password existen
        if (tenant_id and domain and descripcion and correo):
            # Conectar DynamoDB
            dynamodb = boto3.resource('dynamodb')
            t_usuarios = dynamodb.Table(nombre_tabla)
            # Almacena los datos del user en la tabla de usuarios en DynamoDB
            t_usuarios.put_item(
                Item={
                    'tenant_id': tenant_id,
                    'descripcion':descripcion,
                    "correo": correo,
                    'domain': domain
                }
            )
            # Retornar un código de estado HTTP 200 (OK) y un mensaje de éxito
            mensaje = {
                'message': 'Org registered successfully',
                'nombre': tenant_id
            }
            return {
                'statusCode': 200,
                'body': mensaje
            }
        else:
            mensaje = {
                'error': 'Invalid request body: missing tennant_ id or descripcion or domain or correo'
            }
            return {
                'statusCode': 400,
                'body': mensaje
            }

    except Exception as e:
        # Excepción y retornar un código de error HTTP 500
        print("Exception:", str(e))
        mensaje = {
            'error': str(e)
        }        
        return {
            'statusCode': 500,
            'body': mensaje
        }