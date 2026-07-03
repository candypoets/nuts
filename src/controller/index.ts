import { persistentWritable } from 'src/lib/persistentWritable';

export * from 'src/controller/editor';
export * from 'src/controller/key';
export * from 'src/controller/admin';
export * from 'src/controller/nostr';
export * from 'src/controller/time';
export * from 'src/controller/wallet';
export * from 'src/controller/viewport';
export * from 'src/controller/theme';

export const lastNotificationView = persistentWritable<number>('lastNotificationView', Date.now());
