const { validationResult } = require('express-validator');
const db = require('../database/db');

async function assertJourneyAccess(journeyId, userId) {
  const result = await db.query(
    `SELECT j.*,
            CASE WHEN c.user1_id = j.created_by THEN c.user2_id ELSE c.user1_id END AS partner_id
       FROM deep_dive_journeys j
       LEFT JOIN couples c ON c.id = j.couple_id
      WHERE j.id = $1`,
    [journeyId]
  );
  if (result.rows.length === 0) return null;
  const journey = result.rows[0];

  let viewerRole = null;
  if (journey.created_by === userId) {
    viewerRole = 'owner';
  } else if (
    journey.partner_id === userId &&
    journey.status !== 'in_progress' &&
    journey.status !== 'abandoned'
  ) {
    viewerRole = 'partner';
  }
  if (!viewerRole) return null;

  return {
    journey,
    viewerRole,
    ownerId: journey.created_by,
    partnerId: journey.partner_id || null,
    coupleId: journey.couple_id || null,
  };
}

async function loadJourneyArtifacts(journeyId) {
  const [letters, partner] = await Promise.all([
    db.query(
      `SELECT kind, visibility, content, status, updated_at
         FROM deep_dive_letters WHERE journey_id = $1`,
      [journeyId]
    ),
    db.query(
      `SELECT responder_id, mirror, validation, response, status, updated_at
         FROM deep_dive_partner_responses WHERE journey_id = $1`,
      [journeyId]
    ),
  ]);
  return { letters: letters.rows, partnerResponse: partner.rows[0] || null };
}

function serializeJourney(journey, artifacts, viewerRole) {
  const { letters = [], partnerResponse = null } = artifacts || {};
  const byKind = {};
  for (const l of letters) byKind[l.kind] = l;

  const partnerLetter = byKind.partner;
  const partnerLetterShared =
    partnerLetter && partnerLetter.visibility === 'shared'
      ? { content: partnerLetter.content, updated_at: partnerLetter.updated_at }
      : null;

  if (viewerRole === 'partner') {
    return {
      id: journey.id,
      role: 'partner',
      status: journey.status,
      current_step: journey.current_step,
      partner_letter: partnerLetterShared,
      current_need: (journey.state && journey.state.current_need) || null,
      partner_response: partnerResponse
        ? {
            mirror: partnerResponse.mirror || null,
            validation: partnerResponse.validation || null,
            response: partnerResponse.response || null,
            status: partnerResponse.status,
          }
        : null,
      created_at: journey.created_at,
      updated_at: journey.updated_at,
    };
  }

  return {
    id: journey.id,
    role: 'owner',
    status: journey.status,
    current_step: journey.current_step,
    event_id: journey.event_id || null,
    state: journey.state || {},
    letters: {
      past: byKind.past ? { content: byKind.past.content, status: byKind.past.status } : null,
      compassion: byKind.compassion
        ? { content: byKind.compassion.content, status: byKind.compassion.status }
        : null,
      partner: partnerLetter
        ? {
            content: partnerLetter.content,
            status: partnerLetter.status,
            visibility: partnerLetter.visibility,
          }
        : null,
    },
    partner_response: partnerResponse
      ? {
          mirror: partnerResponse.mirror || null,
          validation: partnerResponse.validation || null,
          response: partnerResponse.response || null,
          status: partnerResponse.status,
        }
      : null,
    created_at: journey.created_at,
    updated_at: journey.updated_at,
  };
}

function sendValidationError(req, res, errorCode = null) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const list = errors.array();
    const specific = list.find((e) => e.msg && e.msg !== 'Invalid value');
    res.status(400).json({
      success: false,
      message: specific ? specific.msg : '驗證失敗',
      errors: list,
      ...(errorCode ? { error_code: errorCode } : {}),
    });
    return true;
  }
  return false;
}

module.exports = {
  assertJourneyAccess,
  loadJourneyArtifacts,
  serializeJourney,
  sendValidationError,
};
