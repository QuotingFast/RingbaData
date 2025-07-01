const express = require('express');
const { param, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');
const { pingRingba, validateRingbaConfig } = require('../services/ringba');

const router = express.Router();
const prisma = new PrismaClient();

const triggerPingValidation = [
  param('leadId')
    .notEmpty()
    .withMessage('Lead ID is required')
    .isString()
    .withMessage('Lead ID must be a string')
];

router.post('/trigger-ping/:leadId', triggerPingValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn('Trigger ping validation failed', {
      errors: errors.array(),
      params: req.params
    });
    return res.status(400).json({
      error: 'Validation Error',
      details: errors.array()
    });
  }

  const { leadId } = req.params;

  try {
    if (!validateRingbaConfig()) {
      logger.error('Ringba configuration invalid');
      return res.status(500).json({
        error: 'Configuration Error',
        message: 'External service not configured'
      });
    }

    const lead = await prisma.lead.findUnique({
      where: { id: leadId }
    });

    if (!lead) {
      logger.warn('Lead not found for trigger ping', { leadId });
      return res.status(404).json({
        error: 'Not Found',
        message: 'Lead not found'
      });
    }

    logger.info('Processing trigger ping', {
      leadId: lead.id,
      externalLeadId: lead.externalLeadId,
      currentStatus: lead.status
    });

    res.status(200).json({
      success: true,
      leadId: lead.id,
      message: 'Ping request received'
    });

    setImmediate(async () => {
      try {
        const ringbaResponse = await pingRingba(lead);
        
        const updateData = {
          status: 'PINGED',
          pingedAt: new Date()
        };

        if (ringbaResponse.bid && ringbaResponse.bid > 0) {
          updateData.status = 'ACCEPTED';
          updateData.ringbaBid = parseFloat(ringbaResponse.bid);
          updateData.ringbaBuyerId = ringbaResponse.buyerId || null;
          updateData.ringbaToken = ringbaResponse.token || null;

          logger.info('Lead accepted by Ringba', {
            leadId: lead.id,
            bid: ringbaResponse.bid,
            buyerId: ringbaResponse.buyerId
          });
        } else {
          updateData.status = 'REJECTED';
          updateData.ringbaBid = 0;

          logger.info('Lead rejected by Ringba', {
            leadId: lead.id,
            reason: ringbaResponse.error || 'Zero bid'
          });
        }

        await prisma.lead.update({
          where: { id: leadId },
          data: updateData
        });

      } catch (error) {
        logger.error('Failed to process ping asynchronously', {
          leadId: lead.id,
          error: error.message
        });

        try {
          await prisma.lead.update({
            where: { id: leadId },
            data: {
              status: 'REJECTED',
              pingedAt: new Date(),
              ringbaBid: 0
            }
          });
        } catch (updateError) {
          logger.error('Failed to update lead after ping error', {
            leadId: lead.id,
            error: updateError.message
          });
        }
      }
    });

  } catch (error) {
    logger.error('Failed to process trigger ping', {
      leadId,
      error: error.message
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to process ping request'
    });
  }
});

router.get('/lead/:leadId', triggerPingValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation Error',
      details: errors.array()
    });
  }

  const { leadId } = req.params;

  try {
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        externalLeadId: true,
        phone: true,
        firstName: true,
        lastName: true,
        state: true,
        zip: true,
        insuranceStatus: true,
        status: true,
        createdAt: true,
        pingedAt: true
      }
    });

    if (!lead) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Lead not found'
      });
    }

    res.json(lead);
  } catch (error) {
    logger.error('Failed to get lead', { leadId, error: error.message });
    res.status(500).json({ error: 'Failed to get lead' });
  }
});

module.exports = router;
