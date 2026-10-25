import { validate } from '../utils/validation.js';
import { discoveryQuery } from '../utils/locationValidation.js';
import { discover } from '../services/discoveryService.js';
export const discoveryController =
  (config, ranked = false) =>
  async (req, res) => {
    res.json(
      await discover(
        req.user,
        validate(discoveryQuery, req.query),
        config,
        ranked,
      ),
    );
  };
