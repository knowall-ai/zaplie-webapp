// filepath: /c:/projects/ZapVibes/tabs/backend/server.js
const { createApp } = require('./app');

const port = process.env.PORT || 5000;

createApp().listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
