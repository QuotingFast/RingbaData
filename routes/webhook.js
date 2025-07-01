const express = require('express');
const { body, validationResult } = require('express-validator');
const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const router = express.Router();
const prisma = new PrismaClient();

function validatePhoneNumber(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+1${digits}`;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  } else if (digits.startsWith('+')) {
    return phone;
  } else {
    return `+${digits}`;
  }
}

const leadValidation = [
  body('phone')
    .notEmpty()
    .withMessage('Phone number is required')
    .isMobilePhone('any', { strictMode: false })
    .withMessage('Invalid phone number format'),
  body('firstName').optional().isString().trim(),
  body('lastName').optional().isString().trim(),
  body('state').optional().isString().trim(),
  body('zip').optional().isString().trim(),
  body('insuranceStatus').optional().isString().trim(),
  body('leadId').optional().isString().trim()
];

router.post('/lead', leadValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn('Webhook validation failed', {
      errors: errors.array(),
      body: req.body
    });
    return res.status(400).json({
      error: 'Validation Error',
      details: errors.array()
    });
  }

  const {
    phone,
    firstName,
    lastName,
    state,
    zip,
    insuranceStatus,
    leadId,
    ...additionalData
  } = req.body;

  try {
    const formattedPhone = validatePhoneNumber(phone);

    const leadData = {
      externalLeadId: leadId,
      phone: formattedPhone,
      firstName: firstName || null,
      lastName: lastName || null,
      state: state || null,
      zip: zip || null,
      insuranceStatus: insuranceStatus || null,
      fullPayload: req.body,
      status: 'NEW'
    };

    const lead = await prisma.lead.create({
      data: leadData
    });

    logger.info('Lead created successfully', {
      leadId: lead.id,
      externalLeadId: lead.externalLeadId,
      phone: formattedPhone
    });

    res.status(200).json({
      success: true,
      leadId: lead.id,
      message: 'Lead received successfully'
    });

  } catch (error) {
    if (error.code === 'P2002' && error.meta?.target?.includes('phone')) {
      logger.warn('Duplicate phone number', {
        phone: phone,
        error: error.message
      });
      return res.status(409).json({
        error: 'Duplicate Lead',
        message: 'A lead with this phone number already exists'
      });
    }

    logger.error('Failed to create lead', {
      error: error.message,
      body: req.body
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to process lead'
    });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const stats = await prisma.lead.groupBy({
      by: ['status'],
      _count: {
        status: true
      }
    });

    const totalLeads = await prisma.lead.count();
    const todayLeads = await prisma.lead.count({
      where: {
        createdAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0))
        }
      }
    });

    res.json({
      totalLeads,
      todayLeads,
      statusBreakdown: stats.reduce((acc, stat) => {
        acc[stat.status] = stat._count.status;
        return acc;
      }, {})
    });
  } catch (error) {
    logger.error('Failed to get webhook stats', { error: error.message });
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

module.exports = router;
