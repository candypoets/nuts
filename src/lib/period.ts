import { formatDate } from 'date-fns';

export const now = () => Math.floor(Date.now() / 1000);

export const ago = (seconds: number) => now() - seconds;

export const DAY = 86400;
export const HOUR = 3600;
export const MINUTE = 60;
export const SECOND = 1;
