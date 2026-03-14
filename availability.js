import { db } from '../../../lib/firebaseAdmin';

const DURATION_HOME_SERVICE = 45; // minutes
const DURATION_BARBERSHOP = 30; // minutes
const OPERATING_HOURS = {
    start: 10 * 60, // 10:00 AM in minutes
    end: (20 * 60) + 30, // 8:30 PM in minutes
};
