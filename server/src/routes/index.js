import { Router } from 'express';
import { authRouter } from './auth.js';
import { listingsRouter } from './listings.js';
import { speechRouter } from './speech.js';
import { claimsRouter, listingClaimsRouter } from './claims.js';
import { notificationsRouter } from './notifications.js';
import { dashboardRouter } from './dashboard.js';
import { usersRouter } from './users.js';
import { adminRouter } from './admin.js';
import { ngoRouter } from './ngo.js';
import { recurringRouter } from './recurring.js';

// Module routes are mounted here as each module is built.
// Module 2: auth. Module 3: listings. Module 5: claims. Module 6: notifications.
export const apiRouter = Router();
apiRouter.use('/auth', authRouter);
apiRouter.use('/listings', listingClaimsRouter);
apiRouter.use('/listings', listingsRouter);
apiRouter.use('/speech', speechRouter);
apiRouter.use('/claims', claimsRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/ngo', ngoRouter);
apiRouter.use('/recurring', recurringRouter);
