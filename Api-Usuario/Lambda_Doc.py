import os
import mimetypes
import logging
import base64

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    try:
        # Base de los archivos (doc/index.html, doc/openapi.json)
        base_path = os.path.abspath(os.path.join(os.path.dirname(__file__), 'doc'))

        # Ruta solicitada (viene como /doc o /doc/openapi.json)
        req_path = event.get('rawPath', '/doc')
        logger.info(f"Path solicitado: {req_path}")

        # Quitar el prefijo /doc
        relative_path = req_path.replace('/doc', '', 1)
        if relative_path in ['', '/']:
            relative_path = 'index.html'
        else:
            relative_path = relative_path.lstrip('/')

        # Construir ruta final
        file_path = os.path.abspath(os.path.join(base_path, os.path.normpath(relative_path)))

        # Seguridad: que esté dentro de /doc
        if not file_path.startswith(base_path):
            logger.warning(f"Intento de acceso no permitido: {file_path}")
            return response(403, 'Acceso denegado')

        # Verifica existencia
        if not os.path.isfile(file_path):
            logger.warning(f"Archivo no encontrado: {file_path}")
            return response(404, f'Archivo no encontrado: {relative_path}')

        # Tipo de contenido
        content_type, _ = mimetypes.guess_type(file_path)
        content_type = content_type or 'application/octet-stream'

        # Leer archivo
        with open(file_path, 'rb') as f:
            content = f.read()

        is_binary = not content_type.startswith('text') and content_type not in [
            'application/json', 'application/javascript'
        ]

        logger.info(f'Sirviendo: {relative_path} ({content_type})')
        return {
            'statusCode': 200,
            'headers': {**cors_headers(), 'Content-Type': content_type},
            'body': base64.b64encode(content).decode('utf-8') if is_binary else content.decode('utf-8'),
            'isBase64Encoded': is_binary
        }

    except Exception as e:
        logger.exception('Error en Lambda')
        return response(500, f'Error del servidor: {str(e)}')

def cors_headers():
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS'
    }

def response(code, body):
    return {
        'statusCode': code,
        'headers': cors_headers(),
        'body': body
    }

