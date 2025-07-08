import os
import mimetypes
import logging
import base64

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    try:
        # Obtener la ruta solicitada
        req_path = event.get('rawPath', '/doc')
        base_path = os.path.join(os.path.dirname(__file__), 'doc')

        # Normalizar la ruta solicitada (evita ../ path traversal)
        relative_path = req_path.replace('/doc', '', 1) or '/index.html'
        relative_path = os.path.normpath(relative_path).lstrip(os.sep)
        file_path = os.path.join(base_path, relative_path)

        # Evita acceso fuera del directorio doc
        if not file_path.startswith(base_path):
            logger.warning(f"Intento de acceso no permitido: {file_path}")
            return {
                'statusCode': 403,
                'headers': cors_headers(),
                'body': 'Acceso denegado'
            }

        # Si es un directorio, servir index.html
        if os.path.isdir(file_path):
            file_path = os.path.join(file_path, 'index.html')

        # Detectar tipo MIME
        content_type, _ = mimetypes.guess_type(file_path)
        content_type = content_type or 'application/octet-stream'

        # Leer archivo como binario
        with open(file_path, 'rb') as f:
            content = f.read()

        # Determinar si se debe codificar en base64
        is_binary = not content_type.startswith('text') and content_type not in ['application/json', 'application/javascript']

        response = {
            'statusCode': 200,
            'headers': {**cors_headers(), 'Content-Type': content_type},
            'body': base64.b64encode(content).decode('utf-8') if is_binary else content.decode('utf-8'),
            'isBase64Encoded': is_binary
        }

        logger.info(f'Archivo servido: {file_path} (binary={is_binary})')
        return response

    except FileNotFoundError:
        logger.warning(f'Archivo no encontrado: {req_path}')
        return {
            'statusCode': 404,
            'headers': cors_headers(),
            'body': f'Archivo no encontrado: {req_path}'
        }

    except Exception as e:
        logger.error(f'Error inesperado: {e}')
        return {
            'statusCode': 500,
            'headers': cors_headers(),
            'body': f'Error del servidor: {str(e)}'
        }

def cors_headers():
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*'
    }
