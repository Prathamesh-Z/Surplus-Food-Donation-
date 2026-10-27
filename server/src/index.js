import { createApp } from './app.js';
import { config } from './lib/config.js';
import { startJobs } from './jobs/index.js';

const app = createApp();
app.listen(config.port, () => {
  console.log(`Food Waste Saver server listening on http://localhost:${config.port}`);
  startJobs();
});
