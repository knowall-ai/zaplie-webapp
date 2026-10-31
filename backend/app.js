const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const authMiddleware = require('./authMiddleware'); // Import the authentication middleware
const { createTenantGate } = require('./tenantAccess');

const defaultDataFilePath = path.join(__dirname, 'data.json');

/**
 * Builds the Express app. Options exist so tests can inject a tenant gate
 * (with a local signing key) and a scratch data file.
 */
const createApp = ({
  tenantGate = createTenantGate(),
  dataFilePath = defaultDataFilePath,
} = {}) => {
  const app = express();

  app.use(cors());
  app.use(bodyParser.json());

  // Function to read data from the JSON file
  const readData = () => {
    try {
      const data = fs.readFileSync(dataFilePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.error('Error reading data file:', error);
      return { rewardName: 'sats' }; // Default reward name
    }
  };

  // Function to write data to the JSON file
  const writeData = data => {
    try {
      fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error('Error writing data file:', error);
    }
  };

  // Is the signed-in user's organisation approved to use Zaplie?
  // 200 when approved; 401/403/503 from the tenant gate otherwise.
  app.get('/api/tenant-access', tenantGate, (req, res) => {
    res.send({ approved: true, tenantId: req.entraClaims.tid.toLowerCase() });
  });

  // Endpoint to get the reward name. Read before sign-in (it labels the
  // login page), so it keeps the existing shared-token check.
  app.get('/api/reward-name', authMiddleware, (req, res) => {
    const data = readData();
    res.send({ rewardName: data.rewardName });
  });

  // Endpoint to update the reward name: approved organisations only.
  app.post('/api/reward-name', tenantGate, (req, res) => {
    const { newRewardName } = req.body;
    if (newRewardName) {
      const data = readData();
      data.rewardName = newRewardName;
      writeData(data);
      res.send({
        message: 'Reward name updated successfully',
        rewardName: data.rewardName,
      });
    } else {
      res.status(400).send({ message: 'Invalid reward name' });
    }
  });

  // Any other /api route still requires the existing auth header.
  app.use('/api', authMiddleware);

  // Serve the React app
  app.use(express.static(path.join(__dirname, '../build')));

  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../build', 'index.html'));
  });

  return app;
};

module.exports = { createApp };
