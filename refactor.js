const fs = require('fs');
const path = require('path');

const serverFile = path.join(__dirname, 'server.js');
let code = fs.readFileSync(serverFile, 'utf8');

// Extract the endpoints code
const endpointsStartIndex = code.indexOf('app.post(\'/api/auth/login\'');
const endpointsEndIndex = code.indexOf('app.listen(PORT');
const endpointsCode = code.substring(endpointsStartIndex, endpointsEndIndex);

// Replace app. with router. and remove /api prefix
let routerCode = endpointsCode.replace(/app\.(get|post|put|delete)\('\/api\//g, 'router.$1(\'/');

// Create api.js content
const apiJsContent = `const express = require('express');
const router = express.Router();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const { loadConfig, saveConfig } = require('../config/config');
const { loadUsers, loadProductionLog, saveProductionLog } = require('../services/fileService');
const { odooCall, odooAuth, resolveProductVariant } = require('../services/odooService');
const { resolveProductionBom } = require('../services/bomService');
const { checkRole } = require('../middlewares/authMiddleware');

${routerCode}

module.exports = router;
`;

fs.mkdirSync(path.join(__dirname, 'src/routes'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'src/routes/api.js'), apiJsContent, 'utf8');

// Create new server.js
const newServerJs = `const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./src/routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', apiRoutes);

app.listen(PORT, () => {
  console.log(\`Server is running at http://localhost:\${PORT}\`);
});
`;

fs.writeFileSync(serverFile, newServerJs, 'utf8');

console.log("Refactoring complete!");
