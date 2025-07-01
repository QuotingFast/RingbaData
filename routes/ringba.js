const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const router = express.Router();
const prisma = new PrismaClient();

const postbackValidation = [
  body('leadId').optional().isString(),
  body('externalLeadId').optional().isString(),
  body('status').optional().isString(),
  body('buyerId').optional().isString(),
  body('bid').optional().isNumeric(),
  body('token').optional().isString()
];

router.post('/postback', postbackValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn('Ringba postback validation failed', {
      errors: errors.array(),
      body: req.body
    });
    return res.status(400).json({
      error: 'Validation Error',
      details: errors.array()
    });
  }

  const {
    leadId,
    externalLeadId,
    status,
    buyerId,
    bid,
    token
  } = req.body;

  try {
    let lead = null;

    if (leadId) {
      lead = await prisma.lead.findUnique({
        where: { id: leadId }
      });
    } else if (externalLeadId) {
      lead = await prisma.lead.findFirst({
        where: { externalLeadId: externalLeadId }
      });
    }

    if (!lead) {
      logger.warn('Lead not found for Ringba postback', {
        leadId,
        externalLeadId
      });
      return res.status(404).json({
        error: 'Not Found',
        message: 'Lead not found'
      });
    }

    const updateData = {
      postedAt: new Date()
    };

    if (status && ['NEW', 'PINGED', 'ACCEPTED', 'REJECTED', 'POSTED'].includes(status)) {
      updateData.status = status;
    } else {
      updateData.status = 'POSTED';
    }

    if (bid !== undefined) {
      updateData.ringbaBid = parseFloat(bid);
    }

    if (buyerId) {
      updateData.ringbaBuyerId = buyerId;
    }

    if (token) {
      updateData.ringbaToken = token;
    }

    const updatedLead = await prisma.lead.update({
      where: { id: lead.id },
      data: updateData
    });

    logger.info('Ringba postback processed', {
      leadId: lead.id,
      externalLeadId: lead.externalLeadId,
      status: updateData.status
    });

    res.status(200).json({
      success: true,
      leadId: updatedLead.id,
      status: updatedLead.status,
      message: 'Postback processed successfully'
    });

  } catch (error) {
    logger.error('Failed to process Ringba postback', {
      leadId,
      externalLeadId,
      error: error.message
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to process postback'
    });
  }
});

module.exports = router;
