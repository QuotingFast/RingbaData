const axios = require('axios');
const logger = require('../utils/logger');

async function pingRingba(lead) {
  try {
    const payload = {
      campaignId: process.env.RINGBA_CAMPAIGN_ID,
      lead: {
        externalLeadId: lead.externalLeadId,
        state: lead.state,
        zip: lead.zip,
        insuranceStatus: lead.insuranceStatus,
        phone: lead.phone,
        firstName: lead.firstName,
        lastName: lead.lastName,
        ...lead.fullPayload
      }
    };

    logger.info(`Pinging Ringba for lead ${lead.id}`, {
      leadId: lead.id,
      externalLeadId: lead.externalLeadId,
      phone: lead.phone
    });

    const { data } = await axios.post(
      'https://api.ringba.com/ping',
      payload,
      { 
        headers: { 
          Authorization: `Bearer ${process.env.RINGBA_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    logger.info(`Ringba response for lead ${lead.id}`, {
      leadId: lead.id,
      bid: data.bid,
      buyerId: data.buyerId
    });

    return data;
  } catch (error) {
    logger.error(`Failed to ping Ringba for lead ${lead.id}`, {
      leadId: lead.id,
      error: error.message
    });
    return { bid: 0, error: error.message };
  }
}

function validateRingbaConfig() {
  if (!process.env.RINGBA_API_KEY) {
    logger.error('RINGBA_API_KEY is not configured');
    return false;
  }
  if (!process.env.RINGBA_CAMPAIGN_ID) {
    logger.error('RINGBA_CAMPAIGN_ID is not configured');
    return false;
  }
  return true;
}

module.exports = {
  pingRingba,
  validateRingbaConfig
};
