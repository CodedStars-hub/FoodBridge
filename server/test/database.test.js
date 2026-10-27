import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { User } from '../src/models/User.js';
import { Donation } from '../src/models/Donation.js';
import { DonationRequest } from '../src/models/DonationRequest.js';
import { Notification } from '../src/models/Notification.js';
import { ImageCleanupTask } from '../src/models/ImageCleanupTask.js';
const uri = 'mongodb://127.0.0.1:1/isolated-pool-fixture';
beforeEach(() => {
  vi.spyOn(mongoose, 'connect').mockResolvedValue(mongoose);
  vi.spyOn(mongoose, 'disconnect').mockResolvedValue();
  for (const model of [
    User,
    Donation,
    DonationRequest,
    Notification,
    ImageCleanupTask,
  ])
    vi.spyOn(model, 'init').mockResolvedValue(model);
});
afterEach(async () => {
  await disconnectDatabase();
  vi.restoreAllMocks();
});
describe('bounded database connection reuse', () => {
  it('coalesces concurrent cold starts and reuses a warm pool after model initialization', async () => {
    let release;
    vi.mocked(mongoose.connect).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const calls = [
      connectDatabase(uri),
      connectDatabase(uri),
      connectDatabase(uri),
    ];
    expect(mongoose.connect).toHaveBeenCalledTimes(1);
    expect(User.init).not.toHaveBeenCalled();
    release(mongoose);
    expect(await Promise.all(calls)).toEqual([true, true, true]);
    expect(await connectDatabase(uri)).toBe(true);
    expect(mongoose.connect).toHaveBeenCalledTimes(1);
    expect(User.init).toHaveBeenCalledTimes(1);
    expect(mongoose.connect).toHaveBeenCalledWith(uri, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 5,
      minPoolSize: 0,
      maxIdleTimeMS: 60000,
      waitQueueTimeoutMS: 5000,
    });
  });
  it('clears failed initialization so the next invocation can retry', async () => {
    vi.mocked(mongoose.connect).mockRejectedValueOnce(
      new Error('isolated connection failure'),
    );
    await expect(connectDatabase(uri)).rejects.toMatchObject({
      message: 'isolated connection failure',
      startupStage: 'database_connection',
    });
    expect(await connectDatabase(uri)).toBe(true);
    expect(mongoose.connect).toHaveBeenCalledTimes(2);
  });
  it('retries after model initialization fails, and refuses switching database identity', async () => {
    vi.mocked(User.init).mockRejectedValueOnce(
      new Error('isolated initialization failure'),
    );
    await expect(connectDatabase(uri)).rejects.toMatchObject({
      message: 'isolated initialization failure',
      startupStage: 'database_indexes',
      startupModel: 'User',
    });
    expect(await connectDatabase(uri)).toBe(true);
    await expect(
      connectDatabase('mongodb://127.0.0.1:1/another-fixture'),
    ).rejects.toThrow('configuration changed');
    expect(mongoose.connect).toHaveBeenCalledTimes(2);
  });
  it('supports explicit local/CLI shutdown followed by fresh initialization', async () => {
    expect(await connectDatabase('')).toBe(false);
    expect(mongoose.connect).not.toHaveBeenCalled();
    await connectDatabase(uri);
    await disconnectDatabase();
    await connectDatabase(uri);
    expect(mongoose.connect).toHaveBeenCalledTimes(2);
  });
});
