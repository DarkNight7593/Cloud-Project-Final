const fs = require('fs');
const path = require('path');

exports.handler = async (event) => {
  const reqPath = event.rawPath || '/doc';
  const basePath = path.resolve(__dirname, 'doc');

  let filePath = path.join(basePath, reqPath.replace(/^\/doc/, '') || '/index.html');

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  let contentType = 'text/html';
  if (filePath.endsWith('.json')) contentType = 'application/json';
  else if (filePath.endsWith('.js')) contentType = 'application/javascript';
  else if (filePath.endsWith('.css')) contentType = 'text/css';

  try {
    const fileContent = fs.readFileSync(filePath);
    return {
      statusCode: 200,
      headers: { 'Content-Type': contentType },
      body: fileContent.toString(),
    };
  } catch (err) {
    console.error('Archivo no encontrado:', filePath, err);
    return {
      statusCode: 404,
      body: 'Archivo no encontrado',
    };
  }
};
