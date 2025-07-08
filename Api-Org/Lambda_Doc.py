import os
import mimetypes
import logging
import base64

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    try:
        # Ruta base del contenido estático
        base_path = os.path.abspath(os.path.join(os.path.dirname(__file__), 'doc'))

        # Ruta solicitada desde el evento
        req_path = event.get('rawPath', '/doc')
        relative_path = req_path.replace('/doc', '', 1) or '/index.html'
        normalized_path = os.path.normpath(relative_path).lstrip('/\\')
        file_path = os.path.abspath(os.path.join(base_path, normalized_path))

        # Evitar acceso fuera de /doc
        if not file_path.startswith(base_path):
            logger.warning(f"Intento de acceso no permitido: {file_path}")
            return {
                'statusCode': 403,
                'headers': cors_headers(),
                'body': 'Acceso denegado'
            }

        # Si es un directorio, buscar index.html
        if os.path.isdir(file_path):
            file_path = os.path.join(file_path, 'index.html')

        # Verificar existencia
        if not os.path.isfile(file_path):
            raise FileNotFoundError(file_path)

        # Detectar MIME
        content_type, _ = mimetypes.guess_type(file_path)
        content_type = content_type or 'application/octet-stream'

        # Leer contenido
        with open(file_path, 'rb') as f:
            content = f.read()

        # Detectar si es binario
        is_binary = not content_type.startswith('text') and content_type not in [
            'application/json',
            'application/javascript'
        ]

        logger.info(f'Archivo servido: {file_path} (binary={is_binary})')

        return {
            'statusCode': 200,
            'headers': {**cors_headers(), 'Content-Type': content_type},
            'body': base64.b64encode(content).decode('utf-8') if is_binary else content.decode('utf-8'),
            'isBase64Encoded': is_binary
        }

    except FileNotFoundError as e:
        logger.warning(f'Archivo no encontrado: {e}')
        return {
            'statusCode': 404,
            'headers': cors_headers(),
            'body': f'Archivo no encontrado: {str(e)}'
        }

    except Exception as e:
        logger.exception('Error inesperado')
        return {
            'statusCode': 500,
            'headers': cors_headers(),
            'body': f'Error del servidor: {str(e)}'
        }

def cors_headers():
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS'
    }
