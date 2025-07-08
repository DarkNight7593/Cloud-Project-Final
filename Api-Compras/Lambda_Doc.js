const fs = require('fs');
const path = require('path');

const MIME_TYPES = {
  '.html': 'text/html',
  '.json': 'application/json',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain'
};

exports.handler = async (event) => {
  try {
    const reqPath = event.rawPath || '/doc';
    const basePath = path.resolve(__dirname, 'doc');

    // Normaliza y evita path traversal
    let relativePath = reqPath.replace(/^\/doc/, '') || '/index.html';
    if (relativePath === '/') relativePath = '/index.html';
    const safePath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
    const filePath = path.join(basePath, safePath);

    console.log(`🔍 Solicitado: ${reqPath}`);
    console.log(`📄 Resuelto: ${filePath}`);

    // Verifica existencia
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      throw new Error('Archivo no encontrado o es un directorio');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const fileBuffer = fs.readFileSync(filePath);

    // Detectar si es binario
    const isBinary = !contentType.startsWith('text') && contentType !== 'application/json';

    return {
      statusCode: 200,
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
      },
      body: isBinary ? fileBuffer.toString('base64') : fileBuffer.toString('utf-8'),
      isBase64Encoded: isBinary
    };

  } catch (err) {
    console.error(`❌ Error al servir archivo: ${err.message}`);
    return {
      statusCode: 404,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
      },
      body: JSON.stringify({
        error: 'Archivo no encontrado',
        detalle: err.message
      }),
    };
  }
};
