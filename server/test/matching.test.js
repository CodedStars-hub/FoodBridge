import { describe, it, expect } from 'vitest';
import {
  matchingComponents,
  weightedScore,
} from '../src/services/discoveryService.js';
import { parseEnvironment } from '../src/config/env.js';
describe('deterministic matching formulas and configuration', () => {
  it('computes the exact documented components and weighted score', () => {
    const values = {
      distanceKm: 2,
      radiusKm: 10,
      quantity: 5,
      available: 10,
      minutesRemaining: 120,
      windowMinutes: 240,
    };
    const components = matchingComponents(values);
    expect(components).toEqual({ distance: 80, quantity: 50, pickupTime: 50 });
    expect(
      weightedScore(components, {
        distance: 0.4,
        quantity: 0.35,
        pickupTime: 0.25,
      }),
    ).toBe(62);
    expect(matchingComponents(values)).toEqual(components);
  });
  it('clamps boundaries to 0–100 and prefers full quantity fits', () => {
    expect(
      matchingComponents({
        distanceKm: 20,
        radiusKm: 10,
        quantity: 5,
        available: 5,
        minutesRemaining: 480,
        windowMinutes: 240,
      }),
    ).toEqual({ distance: 0, quantity: 100, pickupTime: 100 });
  });
  it('validates configurable weights and radius defaults', () => {
    const secret = 'matching-test-only-secret-at-least-32-characters';
    expect(() =>
      parseEnvironment({ JWT_SECRET: secret, MATCH_DISTANCE_WEIGHT: 50 }),
    ).toThrow('sum to 100');
    expect(() =>
      parseEnvironment({
        JWT_SECRET: secret,
        GEO_DEFAULT_RADIUS_KM: 110,
        GEO_MAX_RADIUS_KM: 100,
      }),
    ).toThrow('Default radius');
    const c = parseEnvironment({
      JWT_SECRET: secret,
      MATCH_DISTANCE_WEIGHT: 50,
      MATCH_QUANTITY_WEIGHT: 30,
      MATCH_TIME_WEIGHT: 20,
    });
    expect(c.MATCH_DISTANCE_WEIGHT).toBe(50);
  });
});
