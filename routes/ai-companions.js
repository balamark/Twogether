const express = require('express');
const { publicCompanions } = require('../lib/aiCompanions');

const router = express.Router();

// Public list of selectable AI companions (display copy only, no prompts).
// Unauthenticated so the logged-out showroom can render the same picker.
router.get('/', (req, res) => {
  res.json({ success: true, companions: publicCompanions() });
});

module.exports = router;
