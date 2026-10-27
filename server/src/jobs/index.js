import cron from 'node-cron';
import { runExpiryPass } from '../services/expiryService.js';
import { generateDueOccurrences } from '../services/recurringService.js';

// Background jobs run inside the same Node process (PRD Section 6):
// expiry/near-deadline pass every 60 seconds — in the demo the deadline
// passes and within about a minute the listing expires on screen.
// (Recurring-donation generation joins this scheduler in Module 10, FR-18.)
export function startJobs() {
  cron.schedule('* * * * *', async () => {
    try {
      await runExpiryPass();
      await generateDueOccurrences();
    } catch (err) {
      console.error('Scheduled pass failed:', err.message);
    }
  });
  console.log('Jobs started: expiry pass every 60 seconds');
}
